import { db } from "@/lib/db"
import { redis } from "@/lib/redis"
import { Prisma, RoundEventType } from "@prisma/client"

const EVENTS_CHANNEL = "game:events"
const ROUND_EVENTS_CHANNEL = "game:round:events"

export async function emitGameEvent(roundId: string, eventType: RoundEventType, payload: Record<string, unknown>) {
  await db.roundEventLog.create({
    data: {
      roundId,
      eventType,
      payload: payload as Prisma.InputJsonValue,
    },
  })

  if (redis) {
    const message = JSON.stringify({ roundId, eventType, payload })
    await redis.publish(EVENTS_CHANNEL, message)
    await redis.publish(ROUND_EVENTS_CHANNEL, message)
    if (eventType === RoundEventType.MULTIPLIER_UPDATE && typeof payload.multiplier === "number") {
      await redis.publish(`game:round:${roundId}:multiplier`, payload.multiplier.toString())
    }
  }
}

export { EVENTS_CHANNEL, ROUND_EVENTS_CHANNEL }
