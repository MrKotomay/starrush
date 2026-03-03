import { redis } from "@/lib/redis"
import crypto from "crypto"
import { createLogger } from "@/lib/logger"

const logger = createLogger("redis-lock")

export async function acquireLock(key: string, ttlMs: number) {
  if (!redis) {
    logger.error("redis_lock_unavailable", { key, reason: "REDIS_NOT_CONFIGURED" })
    return { acquired: false, token: "" }
  }
  const token = crypto.randomBytes(16).toString("hex")
  try {
    const ok = await redis.set(`lock:${key}`, token, "PX", ttlMs, "NX")
    return { acquired: ok === "OK", token: ok === "OK" ? token : "" }
  } catch (error) {
    logger.error("redis_lock_acquire_failed", { key, error })
    return { acquired: false, token: "" }
  }
}

export async function releaseLock(key: string, token: string) {
  if (!redis || !token) return
  const lua = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`
  try {
    await redis.eval(lua, 1, `lock:${key}`, token)
  } catch (error) {
    logger.error("redis_lock_release_failed", { key, error })
  }
}
