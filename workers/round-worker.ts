import http from "http"
import { RoundEventType, RoundStatus } from "@prisma/client"
import { db } from "@/lib/db"
import { redis } from "@/lib/redis"
import { acquireLock, releaseLock } from "@/lib/redis-lock"
import { computeRoundMultiplier } from "@/lib/round-multiplier"
import { emitGameEvent } from "@/services/game-events.service"
import { calculateCrashPoint, createRound, crashRound, finishRound, REDIS_KEYS, startRound } from "@/services/game-round.service"
import { repairLockedBalances } from "@/services/reconciliation.service"
import { settleLosses } from "@/services/game-settlement.service"
import { createLogger } from "@/lib/logger"

const LOCK_KEY = "round-worker-lock"

const WAITING_PHASE_MS = Number(process.env.ROUND_WAITING_MS ?? 5000)
const COOLDOWN_PHASE_MS = Number(process.env.ROUND_COOLDOWN_MS ?? 3000)
const TICK_RATE_MS = Number(process.env.ROUND_TICK_MS ?? 100)
const MULTIPLIER_BROADCAST_MS = Number(process.env.ROUND_MULTIPLIER_BROADCAST_MS ?? Math.max(TICK_RATE_MS * 2, 200))
const DEBUG_ROUND_LOOP = process.env.DEBUG_ROUND_LOOP === "1"
const WORKER_HEALTH_PORT = Number(process.env.WORKER_HEALTH_PORT ?? 8082)
const WORKER_HEALTH_MAX_STALE_MS = Number(process.env.WORKER_HEALTH_MAX_STALE_MS ?? Math.max(TICK_RATE_MS * 20, 10_000))
const logger = createLogger("round-worker")

const workerState = {
  bootedAt: Date.now(),
  lastLoopAt: Date.now(),
  lastSuccessfulTickAt: 0,
  lastLockContentionAt: 0,
  fatal: false,
  fatalMessage: null as string | null,
}

let lastMultiplierBroadcastAt = 0
let lastMultiplierBroadcastRoundId: string | null = null

const CRASHED_AT_KEY = (roundId: string) => `game:round:${roundId}:crashed_at`
const LOSSES_SETTLED_KEY = (roundId: string) => `game:round:${roundId}:losses_settled`

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function debugRoundLog(message: string, details?: Record<string, unknown>) {
  if (!DEBUG_ROUND_LOOP) return
  if (details) {
    logger.debug(message, details)
    return
  }
  logger.debug(message)
}

function startHealthServer() {
  const server = http.createServer((req, res) => {
    if (req.url !== "/healthz") {
      res.statusCode = 404
      res.end("Not Found")
      return
    }

    const now = Date.now()
    const lastTickAgeMs =
      workerState.lastSuccessfulTickAt > 0 ? now - workerState.lastSuccessfulTickAt : now - workerState.bootedAt
    const healthy =
      !workerState.fatal &&
      lastTickAgeMs <= WORKER_HEALTH_MAX_STALE_MS &&
      now - workerState.lastLoopAt <= WORKER_HEALTH_MAX_STALE_MS

    const payload = JSON.stringify({
      ok: healthy,
      status: healthy ? "ready" : "degraded",
      service: "worker",
      serverTime: now,
      checks: {
        fatal: workerState.fatal,
        lastLoopAt: workerState.lastLoopAt,
        lastSuccessfulTickAt: workerState.lastSuccessfulTickAt,
        lastTickAgeMs,
        lastLockContentionAt: workerState.lastLockContentionAt || null,
      },
      error: workerState.fatalMessage,
    })

    res.statusCode = healthy ? 200 : 503
    res.setHeader("content-type", "application/json; charset=utf-8")
    res.end(payload)
  })

  server.listen(WORKER_HEALTH_PORT, () => {
    logger.info("worker_health_listening", { port: WORKER_HEALTH_PORT })
  })
}

async function resolveCrashedAt(roundId: string, fallbackMs: number) {
  const crashEvent = await db.roundEventLog.findFirst({
    where: { roundId, eventType: RoundEventType.ROUND_CRASHED },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  })
  return crashEvent?.createdAt.getTime() ?? fallbackMs
}

async function refreshLock(token: string, ttlMs: number) {
  if (!redis || !token) return false
  const lua = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("pexpire", KEYS[1], ARGV[2]) else return 0 end`
  try {
    const res = await redis.eval(lua, 1, `lock:${LOCK_KEY}`, token, ttlMs)
    return res === 1
  } catch (error) {
    logger.error("worker_lock_refresh_failed", { lockKey: LOCK_KEY, error })
    return false
  }
}

async function recoverActiveRound() {
  const round = await db.round.findFirst({
    where: { status: { in: [RoundStatus.RUNNING, RoundStatus.WAITING, RoundStatus.CRASHED] } },
    orderBy: { createdAt: "desc" },
  })

  if (!round || !redis) return

  debugRoundLog("recoverActiveRound: found", {
    roundId: round.id,
    status: round.status,
  })

  await redis.set(REDIS_KEYS.currentRound, round.id)
  await redis.set(REDIS_KEYS.roundState(round.id), round.status)

  if (round.status === RoundStatus.RUNNING) {
    if (!round.startedAt || !round.crashMultiplier) {
      await crashRound(round.id)
      await redis.set(CRASHED_AT_KEY(round.id), Date.now().toString())
      return
    }

    await redis.set(REDIS_KEYS.crashPoint(round.id), round.crashMultiplier.toString())
  }

  if (round.status === RoundStatus.CRASHED) {
    const recoveredCrashAt = await resolveCrashedAt(
      round.id,
      round.startedAt?.getTime() ?? round.createdAt.getTime(),
    )
    await redis.set(CRASHED_AT_KEY(round.id), recoveredCrashAt.toString())
    debugRoundLog("recoverActiveRound: restored crashedAt", {
      roundId: round.id,
      crashedAt: recoveredCrashAt,
    })
  }
}

async function tickRound() {
  if (!redis) throw new Error("REDIS_NOT_CONFIGURED")

  const currentRoundId = await redis.get(REDIS_KEYS.currentRound)
  let round = currentRoundId ? await db.round.findUnique({ where: { id: currentRoundId } }) : null

  if (!round) {
    round = await createRound()
    if (!round) return
    console.log("[RoundWorker] Round created", round.id)
    debugRoundLog("transition: created WAITING round", { roundId: round.id })
  }

  const state = (await redis.get(REDIS_KEYS.roundState(round.id))) || round.status
  debugRoundLog("tick", {
    roundId: round.id,
    dbStatus: round.status,
    redisState: state,
  })

  if (state === RoundStatus.WAITING) {
    const elapsed = Date.now() - round.createdAt.getTime()
    debugRoundLog("WAITING: evaluate start", {
      roundId: round.id,
      elapsed,
      threshold: WAITING_PHASE_MS,
    })
    if (elapsed >= WAITING_PHASE_MS) {
      const started = await startRound(round.id)
      await redis.set(REDIS_KEYS.roundState(round.id), RoundStatus.RUNNING)
      await redis.set(REDIS_KEYS.crashPoint(round.id), started.crashMultiplier?.toString() ?? "0")
      console.log("[RoundWorker] Round started", round.id)
      debugRoundLog("transition: WAITING -> RUNNING", { roundId: round.id })
    }
    return
  }

  if (state === RoundStatus.RUNNING) {
    const startedAt = round.startedAt
    if (!startedAt) {
      await crashRound(round.id)
      await redis.set(CRASHED_AT_KEY(round.id), Date.now().toString())
      console.log("[RoundWorker] Crash triggered (missing startedAt)", round.id)
      return
    }

    const elapsedSeconds = (Date.now() - startedAt.getTime()) / 1000
    const multiplier = computeRoundMultiplier(elapsedSeconds)
    const serverTs = Date.now()

    await redis.set(REDIS_KEYS.multiplier(round.id), multiplier.toFixed(4))
    const shouldBroadcastMultiplier =
      lastMultiplierBroadcastRoundId !== round.id ||
      serverTs - lastMultiplierBroadcastAt >= MULTIPLIER_BROADCAST_MS

    if (shouldBroadcastMultiplier) {
      await emitGameEvent(round.id, RoundEventType.MULTIPLIER_UPDATE, {
        roundId: round.id,
        multiplier: Number(multiplier.toFixed(4)),
        serverTs,
      })
      lastMultiplierBroadcastAt = serverTs
      lastMultiplierBroadcastRoundId = round.id
    }

    const crashPointRaw =
      (await redis.get(REDIS_KEYS.crashPoint(round.id))) || round.crashMultiplier?.toString()
    const crashPoint = crashPointRaw
      ? Number.parseFloat(crashPointRaw)
      : calculateCrashPoint({
          roundId: round.id,
          serverSeedHash: round.serverSeedHash,
          serverSeed: round.serverSeed,
          fairnessVersion: (round as any).fairnessVersion,
          fairnessNonce: (round as any).fairnessNonce,
          clientSeed: (round as any).clientSeed,
          houseEdge: (round as any).houseEdge,
          maxCrash: (round as any).maxCrash,
        })
    debugRoundLog("RUNNING: tick", {
      roundId: round.id,
      multiplier: Number(multiplier.toFixed(4)),
      crashPoint,
    })

    if (multiplier >= crashPoint) {
      await crashRound(round.id)
      const alreadySettled = await redis.get(LOSSES_SETTLED_KEY(round.id))
      if (!alreadySettled) {
        await settleLosses(round.id)
        await redis.set(LOSSES_SETTLED_KEY(round.id), "1")
      }
      await redis.set(CRASHED_AT_KEY(round.id), Date.now().toString())
      console.log("[RoundWorker] Crash triggered", round.id)
      debugRoundLog("transition: RUNNING -> CRASHED", { roundId: round.id })
    }

    return
  }

  if (state === RoundStatus.CRASHED) {
    const alreadySettled = await redis.get(LOSSES_SETTLED_KEY(round.id))
    if (!alreadySettled) {
      await settleLosses(round.id)
      await redis.set(LOSSES_SETTLED_KEY(round.id), "1")
    }
    const crashedAtRaw = await redis.get(CRASHED_AT_KEY(round.id))
    let crashedAt = crashedAtRaw ? Number.parseInt(crashedAtRaw, 10) : Number.NaN
    if (!Number.isFinite(crashedAt)) {
      crashedAt = await resolveCrashedAt(
        round.id,
        round.startedAt?.getTime() ?? round.createdAt.getTime(),
      )
      await redis.set(CRASHED_AT_KEY(round.id), crashedAt.toString())
      debugRoundLog("CRASHED: restored missing crashedAt", {
        roundId: round.id,
        crashedAt,
      })
    }

    debugRoundLog("CRASHED: evaluate finish", {
      roundId: round.id,
      now: Date.now(),
      crashedAt,
      elapsed: Date.now() - crashedAt,
      cooldownMs: COOLDOWN_PHASE_MS,
    })

    if (Date.now() - crashedAt >= COOLDOWN_PHASE_MS) {
      await finishRound(round.id)
      await createRound()
      await redis.del(LOSSES_SETTLED_KEY(round.id))
      console.log("[RoundWorker] Round finished", round.id)
      debugRoundLog("transition: CRASHED -> FINISHED -> WAITING", {
        finishedRoundId: round.id,
      })
    }

    return
  }

  if (state === RoundStatus.FINISHED) {
    debugRoundLog("FINISHED: creating next round", { roundId: round.id })
    await createRound()
  }
}

async function runWorker() {
  if (!redis) throw new Error("REDIS_NOT_CONFIGURED")

  startHealthServer()
  await recoverActiveRound()
  logger.info("reconcile_started")
  await repairLockedBalances()
    .then(() => logger.info("reconcile_complete"))
    .catch((error) => logger.error("reconcile_error", { error }))

  while (true) {
    workerState.lastLoopAt = Date.now()
    const lock = await acquireLock(LOCK_KEY, 15000)
    if (!lock.acquired) {
      workerState.lastLockContentionAt = Date.now()
      logger.warn("worker_lock_contention", { lockKey: LOCK_KEY })
      debugRoundLog("lock: not acquired; retry")
      await sleep(1000)
      continue
    }

    try {
      const refreshed = await refreshLock(lock.token, 15000)
      if (!refreshed) {
        debugRoundLog("lock: refresh failed")
        await sleep(1000)
        continue
      }

      await tickRound()
      workerState.lastSuccessfulTickAt = Date.now()
    } catch (error) {
      logger.error("worker_tick_error", { error })
    } finally {
      await releaseLock(LOCK_KEY, lock.token)
      await sleep(TICK_RATE_MS)
    }
  }
}

runWorker().catch((error) => {
  workerState.fatal = true
  workerState.fatalMessage = error instanceof Error ? error.message : "UNKNOWN"
  logger.error("worker_fatal", { error })
  process.exit(1)
})

// Graceful shutdown
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, async () => {
    logger.info("worker_shutting_down", { signal })
    try {
      await db.$disconnect()
    } catch {}
    process.exit(0)
  })
}
