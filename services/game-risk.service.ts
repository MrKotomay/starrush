import { Currency, FairnessVersion, Prisma, RoundPlayerStatus, RoundStatus } from "@prisma/client"
import { gameConfig } from "@/lib/game-config"
import { db } from "@/lib/db"
import { getOrCreateHouseWallet } from "@/lib/house-ledger.service"
import { calculateCrashPoint } from "@/services/game-fairness.service"

export class RiskLimitExceededError extends Error {
  readonly code = "RISK_LIMIT_EXCEEDED"
  readonly details: Record<string, string>

  constructor(message: string, details: Record<string, string>) {
    super(message)
    this.name = "RiskLimitExceededError"
    this.details = details
  }
}

function asPositiveDecimal(value: Prisma.Decimal | number | string) {
  const amount = new Prisma.Decimal(value)
  if (amount.lte(0)) throw new Error("INVALID_STAKE")
  return amount
}

const RISK_ACTIVE_ROUND_STATUSES = new Set<RoundStatus>([RoundStatus.WAITING, RoundStatus.RUNNING])

type RoundRiskParams = {
  roundId: string
  status: RoundStatus
  maxCrash: Prisma.Decimal
  crashMultiplier: Prisma.Decimal | null
  houseEdge: Prisma.Decimal
  fairnessVersion: FairnessVersion
  fairnessNonce: number
  clientSeed: string | null
  serverSeedHash: string
  serverSeed: string | null
}

function getFallbackRiskMultiplier(maxCrashInput: Prisma.Decimal | number | string) {
  const maxCrash = new Prisma.Decimal(maxCrashInput)
  const fallbackCap = new Prisma.Decimal(gameConfig.riskAcceptanceMaxMultiplier)
  return maxCrash.lessThan(fallbackCap) ? maxCrash : fallbackCap
}

function resolveEffectiveRiskMultiplier(params: RoundRiskParams) {
  if (params.crashMultiplier && params.crashMultiplier.gte(1.01)) {
    return params.crashMultiplier
  }

  if (params.status === RoundStatus.WAITING && params.serverSeed) {
    const exactCrashPoint = calculateCrashPoint({
      fairnessVersion: params.fairnessVersion,
      serverSeed: params.serverSeed,
      serverSeedHash: params.serverSeedHash,
      roundId: params.roundId,
      fairnessNonce: params.fairnessNonce,
      clientSeed: params.clientSeed,
      houseEdge: Number(params.houseEdge.toString()),
      maxCrash: Number(params.maxCrash.toString()),
    })

    if (Number.isFinite(exactCrashPoint) && exactCrashPoint >= 1.01) {
      return new Prisma.Decimal(exactCrashPoint.toString())
    }
  }

  return getFallbackRiskMultiplier(params.maxCrash)
}

async function acquireRoundCurrencyRiskLock(
  tx: Prisma.TransactionClient,
  currency: Currency,
  roundId: string
) {
  await tx.$executeRaw`SET LOCAL lock_timeout = '2s'`
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(
      hashtext(${`starrush:risk:${currency}`}),
      hashtext(${roundId})
    )
  `
}

async function readRoundRiskParams(roundId: string, tx?: Prisma.TransactionClient): Promise<RoundRiskParams> {
  const client = tx ?? db
  const round = await client.round.findUnique({
    where: { id: roundId },
    select: {
      id: true,
      status: true,
      maxCrash: true,
      crashMultiplier: true,
      houseEdge: true,
      fairnessVersion: true,
      fairnessNonce: true,
      clientSeed: true,
      serverSeedHash: true,
      serverSeed: true,
    },
  })

  if (!round) throw new Error("ROUND_NOT_FOUND")
  return {
    roundId: round.id,
    status: round.status,
    maxCrash: new Prisma.Decimal(round.maxCrash),
    crashMultiplier: round.crashMultiplier ? new Prisma.Decimal(round.crashMultiplier) : null,
    houseEdge: new Prisma.Decimal(round.houseEdge),
    fairnessVersion: round.fairnessVersion,
    fairnessNonce: round.fairnessNonce,
    clientSeed: round.clientSeed,
    serverSeedHash: round.serverSeedHash,
    serverSeed: round.serverSeed,
  }
}

export async function computeHouseBankroll(currency: Currency, tx?: Prisma.TransactionClient) {
  await getOrCreateHouseWallet(currency, undefined, tx)

  if (tx) {
    await tx.$queryRaw`SELECT id FROM "HouseWallet" WHERE "currency" = ${currency}::"Currency" FOR UPDATE`
    const lockedWallet = await tx.houseWallet.findUnique({ where: { currency } })
    if (!lockedWallet) throw new Error("HOUSE_WALLET_NOT_FOUND")
    return new Prisma.Decimal(lockedWallet.balance)
  }

  const wallet = await db.houseWallet.findUnique({ where: { currency } })
  if (!wallet) throw new Error("HOUSE_WALLET_NOT_FOUND")
  return new Prisma.Decimal(wallet.balance)
}

export async function computeCurrentRoundExposure(
  currency: Currency,
  roundId: string,
  tx?: Prisma.TransactionClient,
  roundRiskParams?: RoundRiskParams
) {
  const client = tx ?? db
  const params = roundRiskParams ?? (await readRoundRiskParams(roundId, tx))
  if (!RISK_ACTIVE_ROUND_STATUSES.has(params.status)) {
    return new Prisma.Decimal(0)
  }

  const riskMultiplier = resolveEffectiveRiskMultiplier(params)
  const riskMultiplierMinusOne = riskMultiplier.minus(1)
  if (riskMultiplierMinusOne.lte(0)) {
    return new Prisma.Decimal(0)
  }

  const aggregate = await client.roundPlayer.aggregate({
    where: {
      roundId,
      currency,
      status: RoundPlayerStatus.BET_PLACED,
    },
    _sum: { betAmount: true },
  })

  const totalStake = aggregate._sum.betAmount
    ? new Prisma.Decimal(aggregate._sum.betAmount)
    : new Prisma.Decimal(0)

  return totalStake.mul(riskMultiplierMinusOne)
}

export async function computeQueuedRoundExposure(
  currency: Currency,
  maxCrashInput: Prisma.Decimal | number | string,
  tx?: Prisma.TransactionClient
) {
  const client = tx ?? db
  const riskMultiplier = getFallbackRiskMultiplier(maxCrashInput)
  const riskMultiplierMinusOne = riskMultiplier.minus(1)
  if (riskMultiplierMinusOne.lte(0)) {
    return new Prisma.Decimal(0)
  }

  const aggregate = await client.roundQueuedBet.aggregate({
    where: { currency },
    _sum: { betAmount: true },
  })

  const totalStake = aggregate._sum.betAmount
    ? new Prisma.Decimal(aggregate._sum.betAmount)
    : new Prisma.Decimal(0)

  return totalStake.mul(riskMultiplierMinusOne)
}

export async function assertCanAcceptBet(input: {
  currency: Currency
  stake: Prisma.Decimal | number | string
  roundId: string
  tx: Prisma.TransactionClient
}) {
  await acquireRoundCurrencyRiskLock(input.tx, input.currency, input.roundId)

  const stake = asPositiveDecimal(input.stake)
  const roundRiskParams = await readRoundRiskParams(input.roundId, input.tx)
  if (!RISK_ACTIVE_ROUND_STATUSES.has(roundRiskParams.status)) {
    throw new RiskLimitExceededError("Bet rejected: round is not in a risk-active state", {
      currency: input.currency,
      roundId: input.roundId,
      roundStatus: roundRiskParams.status,
    })
  }

  const maxCrash = roundRiskParams.maxCrash
  const riskMultiplier = resolveEffectiveRiskMultiplier(roundRiskParams)
  const riskMultiplierMinusOne = riskMultiplier.minus(1)
  const bankroll = await computeHouseBankroll(input.currency, input.tx)
  const existingExposure = await computeCurrentRoundExposure(
    input.currency,
    input.roundId,
    input.tx,
    roundRiskParams
  )
  const betWorstCaseProfit = stake.mul(riskMultiplierMinusOne)
  const maxPerBet = bankroll.mul(gameConfig.riskMaxPayoutFractionPerBet)
  const maxPerRound = bankroll.mul(gameConfig.riskMaxExposureFractionPerRound)
  const projectedExposure = existingExposure.plus(betWorstCaseProfit)

  if (betWorstCaseProfit.gt(maxPerBet)) {
    throw new RiskLimitExceededError("Bet rejected: per-bet risk cap exceeded", {
      currency: input.currency,
      roundId: input.roundId,
      bankroll: bankroll.toString(),
      maxCrash: maxCrash.toString(),
      riskMultiplier: riskMultiplier.toString(),
      betWorstCaseProfit: betWorstCaseProfit.toString(),
      maxPerBet: maxPerBet.toString(),
    })
  }

  if (projectedExposure.gt(maxPerRound)) {
    throw new RiskLimitExceededError("Bet rejected: round exposure cap exceeded", {
      currency: input.currency,
      roundId: input.roundId,
      bankroll: bankroll.toString(),
      maxCrash: maxCrash.toString(),
      riskMultiplier: riskMultiplier.toString(),
      existingExposure: existingExposure.toString(),
      projectedExposure: projectedExposure.toString(),
      maxPerRound: maxPerRound.toString(),
    })
  }

  return {
    currency: input.currency,
    roundId: input.roundId,
    bankroll,
    maxCrash,
    riskMultiplier,
    existingExposure,
    betWorstCaseProfit,
    projectedExposure,
    maxPerBet,
    maxPerRound,
  }
}

export async function assertCanAcceptQueuedBet(input: {
  currency: Currency
  stake: Prisma.Decimal | number | string
  sourceRoundId: string
  tx: Prisma.TransactionClient
}) {
  await acquireRoundCurrencyRiskLock(input.tx, input.currency, input.sourceRoundId)

  const stake = asPositiveDecimal(input.stake)
  const roundRiskParams = await readRoundRiskParams(input.sourceRoundId, input.tx)
  if (roundRiskParams.status !== RoundStatus.RUNNING) {
    throw new RiskLimitExceededError("Bet rejected: round is not running for queue acceptance", {
      currency: input.currency,
      roundId: input.sourceRoundId,
      roundStatus: roundRiskParams.status,
    })
  }

  const maxCrash = roundRiskParams.maxCrash
  const bankroll = await computeHouseBankroll(input.currency, input.tx)
  const runningRoundExposure = await computeCurrentRoundExposure(
    input.currency,
    input.sourceRoundId,
    input.tx,
    roundRiskParams
  )
  const availableBankrollForQueue = bankroll.minus(runningRoundExposure)

  if (availableBankrollForQueue.lte(0)) {
    throw new RiskLimitExceededError("Bet rejected: queue risk buffer depleted", {
      currency: input.currency,
      roundId: input.sourceRoundId,
      bankroll: bankroll.toString(),
      runningRoundExposure: runningRoundExposure.toString(),
      availableBankrollForQueue: availableBankrollForQueue.toString(),
      maxCrash: maxCrash.toString(),
    })
  }

  const queuedRiskMultiplier = getFallbackRiskMultiplier(maxCrash)
  const queuedRiskMultiplierMinusOne = queuedRiskMultiplier.minus(1)
  const existingQueuedExposure = await computeQueuedRoundExposure(input.currency, queuedRiskMultiplier, input.tx)
  const betWorstCaseProfit = stake.mul(queuedRiskMultiplierMinusOne)
  const maxPerBet = availableBankrollForQueue.mul(gameConfig.riskMaxPayoutFractionPerBet)
  const maxPerRound = availableBankrollForQueue.mul(gameConfig.riskMaxExposureFractionPerRound)
  const projectedQueuedExposure = existingQueuedExposure.plus(betWorstCaseProfit)

  if (betWorstCaseProfit.gt(maxPerBet)) {
    throw new RiskLimitExceededError("Bet rejected: queued per-bet risk cap exceeded", {
      currency: input.currency,
      roundId: input.sourceRoundId,
      bankroll: bankroll.toString(),
      runningRoundExposure: runningRoundExposure.toString(),
      availableBankrollForQueue: availableBankrollForQueue.toString(),
      maxCrash: maxCrash.toString(),
      riskMultiplier: queuedRiskMultiplier.toString(),
      betWorstCaseProfit: betWorstCaseProfit.toString(),
      maxPerBet: maxPerBet.toString(),
    })
  }

  if (projectedQueuedExposure.gt(maxPerRound)) {
    throw new RiskLimitExceededError("Bet rejected: queued round exposure cap exceeded", {
      currency: input.currency,
      roundId: input.sourceRoundId,
      bankroll: bankroll.toString(),
      runningRoundExposure: runningRoundExposure.toString(),
      availableBankrollForQueue: availableBankrollForQueue.toString(),
      maxCrash: maxCrash.toString(),
      riskMultiplier: queuedRiskMultiplier.toString(),
      existingQueuedExposure: existingQueuedExposure.toString(),
      projectedQueuedExposure: projectedQueuedExposure.toString(),
      maxPerRound: maxPerRound.toString(),
    })
  }

  return {
    currency: input.currency,
    roundId: input.sourceRoundId,
    bankroll,
    maxCrash,
    riskMultiplier: queuedRiskMultiplier,
    runningRoundExposure,
    availableBankrollForQueue,
    existingQueuedExposure,
    betWorstCaseProfit,
    projectedQueuedExposure,
    maxPerBet,
    maxPerRound,
  }
}
