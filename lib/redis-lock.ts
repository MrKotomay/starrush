import { redis } from "@/lib/redis"
import crypto from "crypto"

export async function acquireLock(key: string, ttlMs: number) {
  if (!redis) return { acquired: true, token: "no-redis" }
  const token = crypto.randomBytes(16).toString("hex")
  const ok = await redis.set(`lock:${key}`, token, "PX", ttlMs, "NX")
  return { acquired: ok === "OK", token }
}

export async function releaseLock(key: string, token: string) {
  if (!redis) return
  const lua = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`
  await redis.eval(lua, 1, `lock:${key}`, token)
}
