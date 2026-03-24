import "@/lib/load-env"
import Redis from "ioredis"
import { createLogger } from "@/lib/logger"

declare global {
  var redis: Redis | undefined
}

const logger = createLogger("redis")
const redisUrl = process.env.REDIS_URL
const REDIS_LAZY_CONNECT = process.env.REDIS_LAZY_CONNECT !== "0"
const REDIS_CONNECT_TIMEOUT_MS = Number(process.env.REDIS_CONNECT_TIMEOUT_MS ?? 5000)
const REDIS_MAX_RETRY_DELAY_MS = Number(process.env.REDIS_MAX_RETRY_DELAY_MS ?? 2000)

let lastErrorLogAt = 0

function logRedisError(error: unknown) {
  const now = Date.now()
  if (now - lastErrorLogAt < 10_000) return
  lastErrorLogAt = now
  logger.error("redis_error", { error })
}

function createRedisClient(url: string) {
  const client = new Redis(url, {
    lazyConnect: REDIS_LAZY_CONNECT,
    enableOfflineQueue: true,
    maxRetriesPerRequest: 1,
    connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
    retryStrategy(attempt) {
      return Math.min(attempt * 250, REDIS_MAX_RETRY_DELAY_MS)
    },
  })

  client.on("connect", () => {
    logger.info("redis_connect")
  })

  client.on("ready", () => {
    logger.info("redis_ready")
  })

  client.on("reconnecting", (delay: number) => {
    logger.warn("redis_reconnecting", { delayMs: delay })
  })

  client.on("close", () => {
    logger.warn("redis_close")
  })

  client.on("end", () => {
    logger.warn("redis_end")
  })

  client.on("error", (error) => {
    logRedisError(error)
  })

  const originalQuit = client.quit.bind(client)
  client.quit = (async () => {
    if (client.status === "wait" || client.status === "connecting" || client.status === "reconnecting") {
      client.disconnect()
      return "OK"
    }

    return originalQuit()
  }) as Redis["quit"]

  return client
}

export const redis =
  redisUrl && redisUrl.length > 0
    ? globalThis.redis || createRedisClient(redisUrl)
    : undefined

if (process.env.NODE_ENV !== "production" && redis) {
  globalThis.redis = redis
}

export function isRedisConfigured() {
  return Boolean(redis)
}

export function getRedisStatus() {
  return redis?.status ?? "disabled"
}

export async function pingRedis(): Promise<boolean> {
  if (!redis) return false

  try {
    const response = await redis.ping()
    return response === "PONG"
  } catch (error) {
    logRedisError(error)
    return false
  }
}
