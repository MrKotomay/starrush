import { redis } from "@/lib/redis"

export type RateLimitMode = "redis" | "memory-fallback"

type RateLimitResult = {
  allowed: boolean
  remaining: number
  mode: RateLimitMode
}

type MemoryBucket = {
  count: number
  resetAt: number
}

const memoryBuckets = new Map<string, MemoryBucket>()

function memoryRateLimit(key: string, limit: number, windowSeconds: number): RateLimitResult {
  const now = Date.now()
  const redisKey = `rate:${key}`
  const existing = memoryBuckets.get(redisKey)
  const windowMs = windowSeconds * 1000

  if (!existing || existing.resetAt <= now) {
    memoryBuckets.set(redisKey, {
      count: 1,
      resetAt: now + windowMs,
    })

    return {
      allowed: true,
      remaining: Math.max(limit - 1, 0),
      mode: "memory-fallback",
    }
  }

  existing.count += 1

  return {
    allowed: existing.count <= limit,
    remaining: Math.max(limit - existing.count, 0),
    mode: "memory-fallback",
  }
}

export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  if (!redis) {
    return memoryRateLimit(key, limit, windowSeconds)
  }

  try {
    const redisKey = `rate:${key}`
    const current = await redis.incr(redisKey)
    if (current === 1) {
      await redis.expire(redisKey, windowSeconds)
    }

    const remaining = Math.max(limit - current, 0)
    return { allowed: current <= limit, remaining, mode: "redis" }
  } catch {
    return memoryRateLimit(key, limit, windowSeconds)
  }
}
