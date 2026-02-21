import { redis } from "@/lib/redis"

export async function rateLimit(key: string, limit: number, windowSeconds: number) {
  if (!redis) return { allowed: true, remaining: limit }

  try {
    const redisKey = `rate:${key}`
    const current = await redis.incr(redisKey)
    if (current === 1) {
      await redis.expire(redisKey, windowSeconds)
    }

    const remaining = Math.max(limit - current, 0)
    return { allowed: current <= limit, remaining }
  } catch {
    return { allowed: true, remaining: limit }
  }
}
