import Redis from "ioredis"

declare global {
  var redis: Redis | undefined
}

const redisUrl = process.env.REDIS_URL

export const redis =
  redisUrl && redisUrl.length > 0
    ? globalThis.redis || new Redis(redisUrl)
    : undefined

if (process.env.NODE_ENV !== "production" && redis) {
  globalThis.redis = redis
}
