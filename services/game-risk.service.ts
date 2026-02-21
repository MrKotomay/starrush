import { Currency, Prisma, RoundPlayerStatus, RoundStatus } from "@prisma/client"
import { gameConfig } from "@/lib/game-config"
import { db } from "@/lib/db"
import { getOrCreateHouseWallet } from "@/lib/house-ledger.service"

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
  status: RoundStatus
  maxCrash: Prisma.Decimal
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
    select: { id: true, status: true, maxCrash: true },
  })

  if (!round) throw new Error("ROUND_NOT_FOUND")
  return {
    status: round.status,
    maxCrash: new Prisma.Decimal(round.maxCrash),
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

  const maxCrash = params.maxCrash
  const maxCrashMinusOne = maxCrash.minus(1)
  if (maxCrashMinusOne.lte(0)) {
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

  return totalStake.mul(maxCrashMinusOne)
}

export async function computeQueuedRoundExposure(
  currency: Currency,
  maxCrashInput: Prisma.Decimal | number | string,
  tx?: Prisma.TransactionClient
) {
  const client = tx ?? db
  const maxCrash = new Prisma.Decimal(maxCrashInput)
  const maxCrashMinusOne = maxCrash.minus(1)
  if (maxCrashMinusOne.lte(0)) {
    return new Prisma.Decimal(0)
  }

  const aggregate = await client.roundQueuedBet.aggregate({
    where: { currency },
    _sum: { betAmount: true },
  })

  const totalStake = aggregate._sum.betAmount
    ? new Prisma.Decimal(aggregate._sum.betAmount)
    : new Prisma.Decimal(0)

  return totalStake.mul(maxCrashMinusOne)
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
  const maxCrashMinusOne = maxCrash.minus(1)
  const bankroll = await computeHouseBankroll(input.currency, input.tx)
  const existingExposure = await computeCurrentRoundExposure(
    input.currency,
    input.roundId,
    input.tx,
    roundRiskParams
  )
  const betWorstCaseProfit = stake.mul(maxCrashMinusOne)
  const maxPerBet = bankroll.mul(gameConfig.riskMaxPayoutFractionPerBet)
  const maxPerRound = bankroll.mul(gameConfig.riskMaxExposureFractionPerRound)
  const projectedExposure = existingExposure.plus(betWorstCaseProfit)

  if (betWorstCaseProfit.gt(maxPerBet)) {
    throw new RiskLimitExceededError("Bet rejected: per-bet risk cap exceeded", {
      currency: input.currency,
      roundId: input.roundId,
      bankroll: bankroll.toString(),
      maxCrash: maxCrash.toString(),
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
  const maxCrashMinusOne = maxCrash.minus(1)
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

  const existingQueuedExposure = await computeQueuedRoundExposure(input.currency, maxCrash, input.tx)
  const betWorstCaseProfit = stake.mul(maxCrashMinusOne)
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
    runningRoundExposure,
    availableBankrollForQueue,
    existingQueuedExposure,
    betWorstCaseProfit,
    projectedQueuedExposure,
    maxPerBet,
    maxPerRound,
  }
}
