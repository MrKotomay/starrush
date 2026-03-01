import { Prisma, Currency, LedgerStatus, LedgerType, RoundStatus } from "@prisma/client"
import { db } from "@/lib/db"
import { redis } from "@/lib/redis"
import { createTransaction, releaseLockedFunds } from "@/lib/ledger.service"
import {
  assertCanAcceptBet,
  assertCanAcceptQueuedBet,
  RiskLimitExceededError,
} from "@/services/game-risk.service"
import { PublicPlayerProfile } from "@/lib/game/public-player"
import { loadPublicPlayerProfile } from "@/services/public-player-profile.service"
import { createLogger } from "@/lib/logger"

export class InsufficientBalanceError extends Error {}
export class RoundNotAcceptingBetsError extends Error {}
export class DuplicateBetError extends Error {}
export class QueuedBetAlreadyExistsError extends Error {}
export class InvalidBetAmountError extends Error {}
export class BettingClosedError extends Error {}
export { RiskLimitExceededError }

export type PlaceBetResult = {
  mode: "active" | "queued"
  roundId: string
  walletId: string
  betAmount: string
  currency: Currency
  referenceId: string
  placedAt: number
  publicPlayer: PublicPlayerProfile
}

const MAX_BET_TON = new Prisma.Decimal(process.env.MAX_BET_TON ?? "100")
const MAX_BET_STARS = new Prisma.Decimal(process.env.MAX_BET_STARS ?? "1000")
const ROUND_WAITING_MS = Number(process.env.ROUND_WAITING_MS ?? 5000)
const BET_SAFETY_WINDOW_MS = Number(process.env.BET_SAFETY_WINDOW_MS ?? 200)
const CURRENT_ROUND_REDIS_KEY = "game:current_round"
const logger = createLogger("game-betting")

function getMaxBet(currency: Currency) {
  return currency === "TON" ? MAX_BET_TON : MAX_BET_STARS
}

async function resolveCurrentRound() {
  if (!redis) throw new Error("REDIS_NOT_CONFIGURED")

  const currentRoundId = (await redis.get(CURRENT_ROUND_REDIS_KEY)) || undefined
  if (currentRoundId) {
    const round = await db.round.findUnique({ where: { id: currentRoundId } })
    if (round) return round
  }

  return db.round.findFirst({
    where: { status: { in: [RoundStatus.WAITING, RoundStatus.RUNNING] } },
    orderBy: { createdAt: "desc" },
  })
}

export async function placeBet(userId: string, amount: number, currency: Currency): Promise<PlaceBetResult> {
  const betAmount = new Prisma.Decimal(amount)
  if (betAmount.lte(0)) throw new InvalidBetAmountError()

  const maxBet = getMaxBet(currency)
  if (betAmount.greaterThan(maxBet)) throw new InvalidBetAmountError()

  const round = await resolveCurrentRound()
  if (!round || (round.status !== RoundStatus.WAITING && round.status !== RoundStatus.RUNNING)) {
    throw new RoundNotAcceptingBetsError()
  }

  if (round.status === RoundStatus.WAITING) {
    return placeBetForCurrentRound({
      roundId: round.id,
      userId,
      currency,
      betAmount,
    })
  }

  return queueBetForNextRound({
    sourceRoundId: round.id,
    userId,
    currency,
    betAmount,
  })
}

async function placeBetForCurrentRound(input: {
  roundId: string
  userId: string
  currency: Currency
  betAmount: Prisma.Decimal
}): Promise<PlaceBetResult> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL lock_timeout = '2s'`
    await tx.$executeRaw`SET LOCAL statement_timeout = '8s'`

    await tx.$queryRaw`SELECT id FROM "Round" WHERE id = ${input.roundId} FOR UPDATE`
    const lockedRound = await tx.round.findUnique({ where: { id: input.roundId } })
    if (!lockedRound || lockedRound.status !== RoundStatus.WAITING) {
      logger.warn("bet_rejected", { roundId: input.roundId, userId: input.userId, errorCode: "ROUND_NOT_ACCEPTING_BETS" })
      throw new RoundNotAcceptingBetsError()
    }

    const plannedStartAt = lockedRound.createdAt.getTime() + ROUND_WAITING_MS
    if (Date.now() >= plannedStartAt - BET_SAFETY_WINDOW_MS) {
      logger.warn("bet_rejected", {
        roundId: input.roundId,
        userId: input.userId,
        errorCode: "BETTING_CLOSED",
        safetyWindowMs: BET_SAFETY_WINDOW_MS,
      })
      throw new BettingClosedError()
    }

    const wallet = await lockWalletAndAssertAvailable({
      tx,
      userId: input.userId,
      currency: input.currency,
      amount: input.betAmount,
    })

    await assertCanAcceptBet({
      currency: input.currency,
      stake: input.betAmount,
      roundId: input.roundId,
      tx,
    })

    let createdRoundPlayer: {
      createdAt: Date
    } | null = null

    try {
      createdRoundPlayer = await tx.roundPlayer.create({
        data: {
          roundId: input.roundId,
          userId: input.userId,
          currency: input.currency,
          betAmount: input.betAmount,
        } as any,
        select: {
          createdAt: true,
        },
      })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new DuplicateBetError()
      }
      throw e
    }

    const referenceId = `bet:${input.roundId}:${input.userId}`
    await createTransaction(
      {
        userId: input.userId,
        walletId: wallet.id,
        currency: input.currency,
        amount: input.betAmount.mul(-1),
        type: "BET_LOCK" as LedgerType,
        status: LedgerStatus.COMPLETED,
        referenceId,
        metadata: {
          roundId: input.roundId,
          userId: input.userId,
          currency: input.currency,
        },
        lockFunds: true,
      },
      tx
    )

    const publicPlayer = await loadPublicPlayerProfile(input.userId, tx)
    const placedAt = createdRoundPlayer?.createdAt.getTime() ?? Date.now()

    return {
      mode: "active",
      roundId: input.roundId,
      walletId: wallet.id,
      betAmount: input.betAmount.toString(),
      currency: input.currency,
      referenceId,
      placedAt,
      publicPlayer,
    }
  })
}

async function queueBetForNextRound(input: {
  sourceRoundId: string
  userId: string
  currency: Currency
  betAmount: Prisma.Decimal
}): Promise<PlaceBetResult> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL lock_timeout = '2s'`
    await tx.$executeRaw`SET LOCAL statement_timeout = '8s'`

    await tx.$queryRaw`SELECT id FROM "Round" WHERE id = ${input.sourceRoundId} FOR UPDATE`
    const lockedRound = await tx.round.findUnique({ where: { id: input.sourceRoundId } })
    if (!lockedRound || lockedRound.status !== RoundStatus.RUNNING) {
      throw new RoundNotAcceptingBetsError()
    }

    const existingQueuedBet = await tx.roundQueuedBet.findUnique({
      where: { userId: input.userId },
      select: { id: true },
    })
    if (existingQueuedBet) {
      throw new QueuedBetAlreadyExistsError()
    }

    const wallet = await lockWalletAndAssertAvailable({
      tx,
      userId: input.userId,
      currency: input.currency,
      amount: input.betAmount,
    })

    await assertCanAcceptQueuedBet({
      currency: input.currency,
      stake: input.betAmount,
      sourceRoundId: input.sourceRoundId,
      tx,
    })

    let queuedBet: { id: string; createdAt: Date } | null = null
    try {
      queuedBet = await tx.roundQueuedBet.create({
        data: {
          userId: input.userId,
          currency: input.currency,
          betAmount: input.betAmount,
        },
        select: {
          id: true,
          createdAt: true,
        },
      })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new QueuedBetAlreadyExistsError()
      }
      throw e
    }

    const referenceId = `queued-bet:${queuedBet.id}`
    await createTransaction(
      {
        userId: input.userId,
        walletId: wallet.id,
        currency: input.currency,
        amount: input.betAmount.mul(-1),
        type: "BET_LOCK" as LedgerType,
        status: LedgerStatus.COMPLETED,
        referenceId,
        metadata: {
          queue: true,
          sourceRoundId: input.sourceRoundId,
          userId: input.userId,
          currency: input.currency,
        },
        lockFunds: true,
      },
      tx
    )

    const publicPlayer = await loadPublicPlayerProfile(input.userId, tx)

    return {
      mode: "queued",
      roundId: input.sourceRoundId,
      walletId: wallet.id,
      betAmount: input.betAmount.toString(),
      currency: input.currency,
      referenceId,
      placedAt: queuedBet.createdAt.getTime(),
      publicPlayer,
    }
  })
}

async function lockWalletAndAssertAvailable(input: {
  tx: Prisma.TransactionClient
  userId: string
  currency: Currency
  amount: Prisma.Decimal
}) {
  await input.tx.$queryRaw`
    SELECT id FROM "Wallet"
    WHERE "userId" = ${input.userId} AND "currency" = ${input.currency}::"Currency"
    FOR UPDATE
  `

  const wallet = await input.tx.wallet.findUnique({
    where: { userId_currency: { userId: input.userId, currency: input.currency } },
  })

  if (!wallet) throw new InsufficientBalanceError()

  const available = wallet.balance.minus(wallet.lockedBalance)
  if (available.lessThan(input.amount)) throw new InsufficientBalanceError()

  return wallet
}

async function releaseQueuedStakeAndDelete(input: {
  tx: Prisma.TransactionClient
  queuedBet: {
    id: string
    userId: string
    currency: Currency
    betAmount: Prisma.Decimal
  }
  reason: string
}) {
  const wallet = await input.tx.wallet.findUnique({
    where: {
      userId_currency: {
        userId: input.queuedBet.userId,
        currency: input.queuedBet.currency,
      },
    },
    select: { id: true },
  })

  if (wallet) {
    await releaseLockedFunds({
      walletId: wallet.id,
      amount: input.queuedBet.betAmount,
      reason: `queued_bet_released:${input.reason}`,
      tx: input.tx,
    })
  } else {
    logger.warn("queued_bet_release_wallet_missing", {
      queuedBetId: input.queuedBet.id,
      userId: input.queuedBet.userId,
      currency: input.queuedBet.currency,
      reason: input.reason,
    })
  }

  await input.tx.roundQueuedBet.delete({ where: { id: input.queuedBet.id } })
}

export async function activateQueuedBetsForRound(roundId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Round" WHERE id = ${roundId} FOR UPDATE`

    const queuedBets = await tx.roundQueuedBet.findMany({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    })

    if (queuedBets.length === 0) return

    for (const queuedBet of queuedBets) {
      const alreadyExists = await tx.roundPlayer.findUnique({
        where: {
          roundId_userId: {
            roundId,
            userId: queuedBet.userId,
          },
        },
        select: { id: true },
      })

      if (!alreadyExists) {
        try {
          await assertCanAcceptBet({
            currency: queuedBet.currency,
            stake: queuedBet.betAmount,
            roundId,
            tx,
          })

          await tx.roundPlayer.create({
            data: {
              roundId,
              userId: queuedBet.userId,
              currency: queuedBet.currency,
              betAmount: queuedBet.betAmount,
            } as any,
          })
        } catch (error) {
          if (error instanceof RiskLimitExceededError) {
            await releaseQueuedStakeAndDelete({
              tx,
              queuedBet,
              reason: "activation_risk_rejected",
            })
            continue
          }
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
            await releaseQueuedStakeAndDelete({
              tx,
              queuedBet,
              reason: "activation_duplicate_player",
            })
            continue
          }
          throw error
        }
      } else {
        await releaseQueuedStakeAndDelete({
          tx,
          queuedBet,
          reason: "activation_player_already_exists",
        })
        continue
      }

      await tx.roundQueuedBet.delete({ where: { id: queuedBet.id } })
    }
  })
}
