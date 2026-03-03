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

// Periodically clean up expired memory buckets to prevent memory leaks
const MEMORY_CLEANUP_INTERVAL_MS = 60_000
setInterval(() => {
  const now = Date.now()
  for (const [key, bucket] of memoryBuckets) {
    if (bucket.resetAt <= now) {
      memoryBuckets.delete(key)
    }
  }
}, MEMORY_CLEANUP_INTERVAL_MS).unref()

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
    const results = await redis.multi()
      .incr(redisKey)
      .expire(redisKey, windowSeconds, "NX")
      .exec()

    const current = (results?.[0]?.[1] as number) ?? 1
    const remaining = Math.max(limit - current, 0)
    return { allowed: current <= limit, remaining, mode: "redis" }
  } catch {
    return memoryRateLimit(key, limit, windowSeconds)
  }
}
