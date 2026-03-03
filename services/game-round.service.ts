import crypto from "crypto"
import { Prisma, FairnessVersion } from "@prisma/client"
import { db } from "@/lib/db"
import { redis } from "@/lib/redis"
import { gameConfig } from "@/lib/game-config"
import { acquireLock, releaseLock } from "@/lib/redis-lock"
import { emitGameEvent } from "@/services/game-events.service"
import { createPlayerCashoutEventPayload } from "@/services/game-player-events.service"
import { activateQueuedBetsForRound } from "@/services/game-betting.service"
import {
  DEFAULT_CLIENT_SEED,
  DEFAULT_FAIRNESS_NONCE,
  calculateCrashPoint as calculateFairCrashPoint,
} from "@/services/game-fairness.service"
import { loadPublicPlayerProfile } from "@/services/public-player-profile.service"

const REDIS_KEYS = {
  currentRound: "game:current_round",
  roundState: (roundId: string) => `game:round:${roundId}:state`,
  roundPlayers: (roundId: string) => `game:round:${roundId}:players`,
  multiplier: (roundId: string) => `game:round:${roundId}:multiplier`,
  crashPoint: (roundId: string) => `game:round:${roundId}:crash_point`,
}

const LEGACY_SERVER_SEED_KEY = (roundId: string) => `game:round:${roundId}:server_seed`
const WAITING_PHASE_MS = Number(process.env.ROUND_WAITING_MS ?? 5000)
const COOLDOWN_PHASE_MS = Number(process.env.ROUND_COOLDOWN_MS ?? 3000)
const DEBUG_ROUND_LOOP = process.env.DEBUG_ROUND_LOOP === "1"

const RoundStatus = {
  WAITING: "WAITING",
  RUNNING: "RUNNING",
  CRASHED: "CRASHED",
  FINISHED: "FINISHED",
} as const

const RoundPlayerStatus = {
  BET_PLACED: "BET_PLACED",
  CASHED_OUT: "CASHED_OUT",
  LOST: "LOST",
} as const

const RoundEventType = {
  ROUND_WAITING: "ROUND_WAITING",
  ROUND_STARTED: "ROUND_STARTED",
  MULTIPLIER_UPDATE: "MULTIPLIER_UPDATE",
  PLAYER_BET: "PLAYER_BET",
  PLAYER_CASHOUT: "PLAYER_CASHOUT",
  ROUND_CRASHED: "ROUND_CRASHED",
  ROUND_FINISHED: "ROUND_FINISHED",
} as const

const prisma = db as any

function decimalLikeToNumber(value: Prisma.Decimal | number | string | null | undefined) {
  if (value === null || value === undefined) return undefined
  const parsed = typeof value === "number" ? value : Number.parseFloat(value.toString())
  return Number.isFinite(parsed) ? parsed : undefined
}

function debugRoundServiceLog(message: string, details?: Record<string, unknown>) {
  if (!DEBUG_ROUND_LOOP) return
  if (details) {
    console.log(`[RoundServiceDebug] ${message}`, details)
    return
  }
  console.log(`[RoundServiceDebug] ${message}`)
}

export async function createRound() {
  const serverSeed = crypto.randomBytes(32).toString("hex")
  const serverSeedHash = crypto.createHash("sha256").update(serverSeed).digest("hex")

  const round = await prisma.round.create({
    data: {
      status: RoundStatus.WAITING,
      fairnessVersion: FairnessVersion.HMAC_SHA256_V2_BOUNDED_MAX,
      fairnessNonce: DEFAULT_FAIRNESS_NONCE,
      clientSeed: null,
      serverSeedHash,
      serverSeed,
      houseEdge: new Prisma.Decimal(gameConfig.houseEdge),
      maxCrash: new Prisma.Decimal(gameConfig.maxCrash),
    },
  })
  const houseEdge = decimalLikeToNumber(round.houseEdge) ?? gameConfig.houseEdge
  const maxCrash = decimalLikeToNumber(round.maxCrash) ?? gameConfig.maxCrash

  try {
    await activateQueuedBetsForRound(round.id)
  } catch (error) {
    console.error("[RoundService] Failed to activate queued bets", {
      roundId: round.id,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  if (!redis) throw new Error("REDIS_NOT_CONFIGURED")
  const redisClient = redis

  await redisClient.mset({
    [REDIS_KEYS.currentRound]: round.id,
    [REDIS_KEYS.roundState(round.id)]: RoundStatus.WAITING,
    [REDIS_KEYS.multiplier(round.id)]: "1.00",
  })

  await redisClient.del(REDIS_KEYS.roundPlayers(round.id))

  await emitGameEvent(round.id, RoundEventType.ROUND_WAITING, {
    roundId: round.id,
    status: RoundStatus.WAITING,
    serverTime: Date.now(),
    currentMultiplier: 1,
    waitingEndsAt: round.createdAt.getTime() + WAITING_PHASE_MS,
    serverSeedHash,
    fairnessVersion: round.fairnessVersion,
    fairnessNonce: round.fairnessNonce,
    clientSeed: round.clientSeed,
    effectiveClientSeed: round.clientSeed ?? DEFAULT_CLIENT_SEED,
    houseEdge,
    maxCrash,
  })

  debugRoundServiceLog("emit ROUND_WAITING", {
    roundId: round.id,
    status: RoundStatus.WAITING,
    waitingEndsAt: round.createdAt.getTime() + WAITING_PHASE_MS,
  })

  return round
}

async function recoverDurableServerSeed(roundId: string, currentServerSeed: string | null) {
  if (currentServerSeed) return currentServerSeed
  if (!redis) throw new Error("REDIS_NOT_CONFIGURED")

  const legacyServerSeed = await redis.get(LEGACY_SERVER_SEED_KEY(roundId))
  if (!legacyServerSeed) throw new Error("SERVER_SEED_NOT_AVAILABLE")

  await prisma.round.update({
    where: { id: roundId },
    data: { serverSeed: legacyServerSeed },
  })

  return legacyServerSeed
}

export async function startRound(roundId: string) {
  if (!redis) throw new Error("REDIS_NOT_CONFIGURED")
  const redisClient = redis

  const lock = await acquireLock(`round:start:${roundId}`, 5000)
  if (!lock.acquired) throw new Error("ROUND_START_LOCKED")

  try {
    const round = await prisma.round.findUnique({ where: { id: roundId } })
    if (!round) throw new Error("ROUND_NOT_FOUND")
    if (round.status !== RoundStatus.WAITING) return round

    const serverSeed = await recoverDurableServerSeed(round.id, round.serverSeed)

    const crashMultiplier = calculateCrashPoint({
      roundId: round.id,
      serverSeedHash: round.serverSeedHash,
      serverSeed,
      fairnessVersion: round.fairnessVersion,
      fairnessNonce: round.fairnessNonce,
      clientSeed: round.clientSeed,
      houseEdge: round.houseEdge,
      maxCrash: round.maxCrash,
    })

    const updated = await prisma.round.update({
      where: { id: round.id },
      data: {
        status: RoundStatus.RUNNING,
        startedAt: new Date(),
        serverSeed,
        crashMultiplier: new Prisma.Decimal(crashMultiplier),
      },
    })

    await redisClient.mset({
      [REDIS_KEYS.roundState(round.id)]: RoundStatus.RUNNING,
      [REDIS_KEYS.crashPoint(round.id)]: crashMultiplier.toFixed(6),
      [REDIS_KEYS.multiplier(round.id)]: "1.00",
    })

    const startedAtMs = updated.startedAt?.getTime() ?? Date.now()
    const houseEdge = decimalLikeToNumber(round.houseEdge) ?? gameConfig.houseEdge
    const maxCrash = decimalLikeToNumber(round.maxCrash) ?? gameConfig.maxCrash

    await emitGameEvent(round.id, RoundEventType.ROUND_STARTED, {
      roundId: round.id,
      status: RoundStatus.RUNNING,
      serverTime: startedAtMs,
      startedAt: startedAtMs,
      currentMultiplier: 1,
      serverSeedHash: round.serverSeedHash,
      fairnessVersion: round.fairnessVersion,
      fairnessNonce: round.fairnessNonce,
      clientSeed: round.clientSeed,
      effectiveClientSeed: round.clientSeed ?? DEFAULT_CLIENT_SEED,
      houseEdge,
      maxCrash,
    })

    debugRoundServiceLog("emit ROUND_STARTED", {
      roundId: round.id,
      status: RoundStatus.RUNNING,
      startedAt: startedAtMs,
      crashPoint: crashMultiplier,
    })

    return updated
  } finally {
    await releaseLock(`round:start:${roundId}`, lock.token)
  }
}

export function calculateCrashPoint(input: {
  roundId: string
  serverSeedHash: string
  serverSeed?: string | null
  fairnessVersion?: FairnessVersion | null
  fairnessNonce?: number | null
  clientSeed?: string | null
  houseEdge?: Prisma.Decimal | number | string | null
  maxCrash?: Prisma.Decimal | number | string | null
}) {
  const fairnessVersion = input.fairnessVersion ?? FairnessVersion.HMAC_SHA256_V2_BOUNDED_MAX
  const serverSeed = input.serverSeed ?? ""
  const houseEdge = decimalLikeToNumber(input.houseEdge)
  const maxCrash = decimalLikeToNumber(input.maxCrash)

  if (fairnessVersion !== FairnessVersion.LEGACY_HASH_V0 && !serverSeed) {
    throw new Error("SERVER_SEED_REQUIRED")
  }

  return calculateFairCrashPoint({
    fairnessVersion,
    serverSeed,
    serverSeedHash: input.serverSeedHash,
    roundId: input.roundId,
    fairnessNonce: input.fairnessNonce ?? DEFAULT_FAIRNESS_NONCE,
    clientSeed: input.clientSeed ?? DEFAULT_CLIENT_SEED,
    houseEdge,
    maxCrash,
  })
}

/**
 * @deprecated DO NOT USE. This function only updates RoundPlayer status
 * without full financial settlement.
 */
async function _legacyCashoutPlayer_DO_NOT_USE(roundId: string, userId: string) {
  if (!redis) throw new Error("REDIS_NOT_CONFIGURED")
  const redisClient = redis

  const lock = await acquireLock(`cashout:${roundId}:${userId}`, 3000)
  if (!lock.acquired) throw new Error("CASHOUT_LOCKED")

  try {
    const state = await redisClient.get(REDIS_KEYS.roundState(roundId))
    if (state !== RoundStatus.RUNNING) throw new Error("ROUND_NOT_RUNNING")

    const multiplierRaw = await redisClient.get(REDIS_KEYS.multiplier(roundId))
    const multiplier = Number.parseFloat(multiplierRaw || "1")

    const player = await prisma.roundPlayer.findUnique({
      where: { roundId_userId: { roundId, userId } },
    })

    if (!player) throw new Error("PLAYER_NOT_FOUND")
    if (player.status !== RoundPlayerStatus.BET_PLACED) return player

    const payout = new Prisma.Decimal(player.betAmount).mul(multiplier)
    const profit = payout.minus(player.betAmount)

    const updated = await prisma.roundPlayer.update({
      where: { id: player.id },
      data: {
        status: RoundPlayerStatus.CASHED_OUT,
        cashoutMultiplier: new Prisma.Decimal(multiplier),
        profit,
      },
    })

    const publicPlayer = await loadPublicPlayerProfile(userId, prisma)
    const eventPayload = createPlayerCashoutEventPayload({
      roundId,
      multiplier,
      payout: payout.toString(),
      profit: profit.toString(),
      betAmount: player.betAmount.toString(),
      currency: player.currency,
      placedAt: player.createdAt.getTime(),
      publicPlayer,
    })

    await emitGameEvent(roundId, RoundEventType.PLAYER_CASHOUT, eventPayload)

    return updated
  } finally {
    await releaseLock(`cashout:${roundId}:${userId}`, lock.token)
  }
}

export async function crashRound(roundId: string) {
  if (!redis) throw new Error("REDIS_NOT_CONFIGURED")
  const redisClient = redis

  const round = await prisma.round.findUnique({ where: { id: roundId } })
  if (!round) throw new Error("ROUND_NOT_FOUND")

  const serverSeed = await recoverDurableServerSeed(round.id, round.serverSeed)

  const crashMultiplier = calculateCrashPoint({
    roundId: round.id,
    serverSeedHash: round.serverSeedHash,
    serverSeed,
    fairnessVersion: round.fairnessVersion,
    fairnessNonce: round.fairnessNonce,
    clientSeed: round.clientSeed,
    houseEdge: round.houseEdge,
    maxCrash: round.maxCrash,
  })

  const updated = await prisma.round.update({
    where: { id: roundId },
    data: {
      status: RoundStatus.CRASHED,
      serverSeed,
      crashMultiplier: new Prisma.Decimal(crashMultiplier),
    },
  })

  await redisClient.set(REDIS_KEYS.roundState(roundId), RoundStatus.CRASHED)
  await redisClient.del(LEGACY_SERVER_SEED_KEY(roundId))

  const crashAtMs = Date.now()
  const roundedCrashMultiplier = Number(crashMultiplier.toFixed(2))
  const houseEdge = decimalLikeToNumber(round.houseEdge) ?? gameConfig.houseEdge
  const maxCrash = decimalLikeToNumber(round.maxCrash) ?? gameConfig.maxCrash

  await emitGameEvent(roundId, RoundEventType.ROUND_CRASHED, {
    roundId,
    status: RoundStatus.CRASHED,
    serverTime: crashAtMs,
    startedAt: round.startedAt?.getTime() ?? null,
    crashAt: crashAtMs,
    cooldownEndsAt: crashAtMs + COOLDOWN_PHASE_MS,
    currentMultiplier: roundedCrashMultiplier,
    crashMultiplier: roundedCrashMultiplier,
    serverSeedHash: round.serverSeedHash,
    serverSeed,
    fairnessVersion: round.fairnessVersion,
    fairnessNonce: round.fairnessNonce,
    clientSeed: round.clientSeed,
    effectiveClientSeed: round.clientSeed ?? DEFAULT_CLIENT_SEED,
    houseEdge,
    maxCrash,
  })

  debugRoundServiceLog("emit ROUND_CRASHED", {
    roundId,
    status: RoundStatus.CRASHED,
    crashAt: crashAtMs,
    crashMultiplier: roundedCrashMultiplier,
  })

  return updated
}

export async function finishRound(roundId: string) {
  if (!redis) throw new Error("REDIS_NOT_CONFIGURED")
  const redisClient = redis

  const updated = await prisma.round.update({
    where: { id: roundId },
    data: {
      status: RoundStatus.FINISHED,
      finishedAt: new Date(),
    },
  })

  await redisClient.set(REDIS_KEYS.roundState(roundId), RoundStatus.FINISHED)
  await redisClient.del(REDIS_KEYS.multiplier(roundId))

  const finishedAtMs = updated.finishedAt?.getTime() ?? Date.now()

  await emitGameEvent(roundId, RoundEventType.ROUND_FINISHED, {
    roundId,
    status: RoundStatus.FINISHED,
    serverTime: finishedAtMs,
    finishedAt: finishedAtMs,
  })

  debugRoundServiceLog("emit ROUND_FINISHED", {
    roundId,
    status: RoundStatus.FINISHED,
    finishedAt: finishedAtMs,
  })

  return updated
}

export { REDIS_KEYS }
