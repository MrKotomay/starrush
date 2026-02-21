import {
  Prisma,
  HouseLedgerType,
  LedgerStatus,
  LedgerType,
  RoundPlayer,
  RoundPlayerStatus,
  RoundStatus,
  RoundEventType,
} from "@prisma/client"
import { db } from "@/lib/db"
import { redis } from "@/lib/redis"
import { creditHouse, debitHouse } from "@/lib/house-ledger.service"
import { applyTransaction, createTransaction, releaseLockedFunds } from "@/lib/ledger.service"
import { emitGameEvent } from "@/services/game-events.service"
import { REDIS_KEYS } from "@/services/game-round.service"
import { PublicPlayerProfile } from "@/lib/game/public-player"
import { createPlayerCashoutEventPayload } from "@/services/game-player-events.service"
import { loadPublicPlayerProfile } from "@/services/public-player-profile.service"

export class RoundNotRunningError extends Error {}
export class PlayerAlreadyCashedOutError extends Error {}
export class PlayerNotFoundError extends Error {}
export class CashoutClosedError extends Error {}

export type CashoutResult = {
  roundId: string
  userId: string
  player: RoundPlayer
  profit: string
  payout: string
  multiplier: number
  betAmount: string
  currency: "TON" | "STARS"
  placedAt: number
  publicPlayer: PublicPlayerProfile
}

const BET_SAFETY_WINDOW_MS = Number(process.env.BET_SAFETY_WINDOW_MS ?? 200)
const GROWTH_RATE = Number(process.env.ROUND_GROWTH_RATE ?? 0.15)
export const CASHOUT_MULTIPLIER_SCALE = 4
export const CASHOUT_MONEY_SCALE = 9

function quantizeMoney(value: Prisma.Decimal) {
  return value.toDecimalPlaces(CASHOUT_MONEY_SCALE, Prisma.Decimal.ROUND_HALF_UP)
}

export function computeCashoutAmounts(stakeInput: Prisma.Decimal | number | string, rawMultiplier: number) {
  const stake = new Prisma.Decimal(stakeInput)
  if (stake.lte(0)) throw new Error("INVALID_STAKE")
  if (!Number.isFinite(rawMultiplier) || rawMultiplier < 1) throw new Error("INVALID_MULTIPLIER")

  const multiplier = Number.parseFloat(rawMultiplier.toFixed(CASHOUT_MULTIPLIER_SCALE))
  const multiplierDecimal = new Prisma.Decimal(multiplier.toFixed(CASHOUT_MULTIPLIER_SCALE))

  // Settlement semantics: payout = stake * multiplier, profit = payout - stake.
  const payout = quantizeMoney(stake.mul(multiplierDecimal))
  const profit = quantizeMoney(payout.minus(stake))

  return {
    stake,
    multiplier,
    multiplierDecimal,
    payout,
    profit,
  }
}

export async function cashoutPlayer(roundId: string, userId: string): Promise<CashoutResult> {
  if (!redis) throw new Error("REDIS_NOT_CONFIGURED")

  const multiplierRaw = (await redis.get(REDIS_KEYS.multiplier(roundId))) || null

  const result = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL lock_timeout = '2s'`
    await tx.$executeRaw`SET LOCAL statement_timeout = '8s'`

    await tx.$queryRaw`SELECT id FROM "Round" WHERE id = ${roundId} FOR UPDATE`
    const round = await tx.round.findUnique({ where: { id: roundId } })
    if (!round || round.status !== RoundStatus.RUNNING) {
      throw new RoundNotRunningError()
    }

    if (!round.startedAt) throw new RoundNotRunningError()

    if (Date.now() - round.startedAt.getTime() < BET_SAFETY_WINDOW_MS) {
      console.info("[Cashout] Rejected by safety window", { roundId, userId, safetyWindowMs: BET_SAFETY_WINDOW_MS })
      throw new CashoutClosedError()
    }

    const playerSnapshot = await tx.roundPlayer.findUnique({
      where: { roundId_userId: { roundId, userId } },
    })

    if (!playerSnapshot) throw new PlayerNotFoundError()

    const playerCurrency = (playerSnapshot as { currency?: string }).currency
    await tx.$queryRaw`SELECT id FROM "Wallet" WHERE "userId" = ${userId} AND "currency" = ${playerCurrency}::"Currency" FOR UPDATE`

    const wallet = await tx.wallet.findUnique({
      where: { userId_currency: { userId, currency: playerCurrency as any } },
    })

    if (!wallet) throw new PlayerNotFoundError()

    await tx.$queryRaw`SELECT id FROM "RoundPlayer" WHERE "roundId" = ${roundId} AND "userId" = ${userId} FOR UPDATE`
    const player = await tx.roundPlayer.findUnique({
      where: { roundId_userId: { roundId, userId } },
    })

    if (!player) throw new PlayerNotFoundError()
    if (player.status === RoundPlayerStatus.CASHED_OUT) throw new PlayerAlreadyCashedOutError()
    if (player.status === RoundPlayerStatus.LOST) throw new PlayerNotFoundError()

    const multiplier = multiplierRaw
      ? Number.parseFloat(multiplierRaw)
      : Math.exp(GROWTH_RATE * ((Date.now() - round.startedAt.getTime()) / 1000))

    const settlement = computeCashoutAmounts(player.betAmount, multiplier)

    const winEntry = await createTransaction(
      {
        userId,
        walletId: wallet.id,
        currency: wallet.currency,
        amount: settlement.profit,
        type: "BET_WIN" as LedgerType,
        status: LedgerStatus.PENDING,
        referenceId: `cashout:${roundId}:${userId}`,
        metadata: {
          roundId,
          userId,
          multiplier: settlement.multiplier,
          payout: settlement.payout.toString(),
          profit: settlement.profit.toString(),
        },
        lockFunds: false,
      },
      tx
    )
    await applyTransaction(winEntry.id, tx)

    await releaseLockedFunds({
      walletId: wallet.id,
      amount: player.betAmount,
      reason: "cashout",
      tx,
    })

    const updatedPlayer = await tx.roundPlayer.update({
      where: { id: player.id },
      data: {
        status: RoundPlayerStatus.CASHED_OUT,
        cashoutMultiplier: settlement.multiplierDecimal,
        profit: settlement.profit,
      },
    })

    if (settlement.profit.gt(0)) {
      await debitHouse(
        {
          currency: wallet.currency,
          amount: settlement.profit,
          type: HouseLedgerType.BET_WIN,
          roundId,
          userId,
          metadata: {
            roundId,
            userId,
            multiplier: settlement.multiplier,
            payout: settlement.payout.toString(),
            profit: settlement.profit.toString(),
          },
        },
        tx
      )
    }

    const publicPlayer = await loadPublicPlayerProfile(userId, tx)

    return {
      roundId,
      userId,
      player: updatedPlayer,
      profit: settlement.profit.toString(),
      payout: settlement.payout.toString(),
      multiplier: settlement.multiplier,
      betAmount: updatedPlayer.betAmount.toString(),
      currency: updatedPlayer.currency,
      placedAt: updatedPlayer.createdAt.getTime(),
      publicPlayer,
    }
  })

  const eventPayload = createPlayerCashoutEventPayload({
    roundId: result.roundId,
    multiplier: result.multiplier,
    payout: result.payout,
    profit: result.profit,
    betAmount: result.betAmount,
    currency: result.currency,
    placedAt: result.placedAt,
    publicPlayer: result.publicPlayer,
  })
  emitGameEvent(roundId, RoundEventType.PLAYER_CASHOUT, eventPayload).catch((error) =>
    console.error("[Cashout] Event emit failed", error)
  )

  return result
}

export async function settleLosses(
  roundId: string,
  options?: { batchSize?: number; maxBatches?: number; lockTimeoutMs?: number }
) {
  const batchSize = options?.batchSize ?? 50
  const maxBatches = options?.maxBatches ?? 50
  const lockTimeoutMs = options?.lockTimeoutMs ?? 2000

  let batch = 0
  let processed = 0
  let skipped = 0

  console.log("[Settlement] settleLosses start", { roundId, batchSize, maxBatches, lockTimeoutMs })

  while (batch < maxBatches) {
    batch += 1

    const players = await db.roundPlayer.findMany({
      where: { roundId, status: RoundPlayerStatus.BET_PLACED },
      orderBy: { createdAt: "asc" },
      take: batchSize,
    })

    if (players.length === 0) break

    let batchProcessed = 0
    let batchSkipped = 0

    for (const player of players) {
      try {
        await db.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '${lockTimeoutMs}ms'`)
          await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = '${Math.max(lockTimeoutMs * 3, 5000)}ms'`)

          const playerCurrency = (player as { currency?: string }).currency
          await tx.$queryRaw`SELECT id FROM "Wallet" WHERE "userId" = ${player.userId} AND "currency" = ${playerCurrency}::"Currency" FOR UPDATE`

          const wallet = await tx.wallet.findUnique({
            where: { userId_currency: { userId: player.userId, currency: playerCurrency as any } },
          })

          if (!wallet) {
            console.warn("[Settlement] Wallet not found", { roundId, userId: player.userId })
            return
          }

          await tx.$queryRaw`SELECT id FROM "RoundPlayer" WHERE id = ${player.id} FOR UPDATE`
          const current = await tx.roundPlayer.findUnique({ where: { id: player.id } })
          if (!current || current.status !== RoundPlayerStatus.BET_PLACED) return

          const lossEntry = await createTransaction(
            {
              userId: current.userId,
              walletId: wallet.id,
              currency: wallet.currency,
              amount: current.betAmount.mul(-1),
              type: "BET_LOSS_SETTLEMENT" as LedgerType,
              status: LedgerStatus.PENDING,
              referenceId: `loss:${roundId}:${current.userId}`,
              metadata: { roundId, userId: current.userId, betAmount: current.betAmount.toString() },
              lockFunds: false,
            },
            tx
          )
          await applyTransaction(lossEntry.id, tx)

          await creditHouse(
            {
              currency: wallet.currency,
              amount: current.betAmount,
              type: HouseLedgerType.BET_LOSS_SETTLEMENT,
              roundId,
              userId: current.userId,
              metadata: {
                roundId,
                userId: current.userId,
                betAmount: current.betAmount.toString(),
              },
            },
            tx
          )

          await tx.roundPlayer.update({
            where: { id: current.id },
            data: { status: RoundPlayerStatus.LOST, profit: new Prisma.Decimal(0) },
          })
        })

        batchProcessed += 1
      } catch (error) {
        batchSkipped += 1
        console.error("[Settlement] Player settlement failed", { roundId, playerId: player.id, error })
      }
    }

    processed += batchProcessed
    skipped += batchSkipped

    console.log("[Settlement] settleLosses batch", { roundId, batch, batchProcessed, batchSkipped })

    if (batchProcessed === 0 && batchSkipped > 0) {
      console.warn("[Settlement] settleLosses exit due to repeated skips", { roundId, batch })
      break
    }
  }

  console.log("[Settlement] settleLosses complete", { roundId, processed, skipped, batches: batch })
  return { processed, skipped, batches: batch }
}

export async function settleRound(roundId: string) {
  await settleLosses(roundId)

  const round = await db.round.update({
    where: { id: roundId },
    data: { status: RoundStatus.FINISHED, finishedAt: new Date() },
  })

  emitGameEvent(roundId, RoundEventType.ROUND_FINISHED, { roundId }).catch((error) =>
    console.error("[Settlement] Round finished event emit failed", error)
  )

  return round
}
