import { db } from "@/lib/db"
import { jsonUtf8 } from "@/lib/http"
import { getRedisStatus, isRedisConfigured, pingRedis } from "@/lib/redis"

async function pingDatabase() {
  try {
    await db.$queryRaw`SELECT 1`
    return true
  } catch {
    return false
  }
}

export async function GET() {
  const [databaseOk, redisOk] = await Promise.all([
    pingDatabase(),
    pingRedis(),
  ])

  const ready = databaseOk && redisOk && isRedisConfigured()

  return jsonUtf8(
    {
      ok: ready,
      status: ready ? "ready" : "degraded",
      service: "app",
      checks: {
        database: databaseOk,
        redis: redisOk,
        redisConfigured: isRedisConfigured(),
        redisStatus: getRedisStatus(),
      },
      serverTime: Date.now(),
    },
    { status: ready ? 200 : 503 },
  )
}
