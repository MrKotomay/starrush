import http from "http"
import WebSocket, { WebSocketServer } from "ws"
import { db } from "@/lib/db"
import { getRedisStatus, isRedisConfigured, pingRedis, redis } from "@/lib/redis"
import { authenticateWs } from "@/gateway/auth/ws-auth"
import { createRedisSubscriber } from "@/gateway/redis/redis-subscriber"
import { RoundRoomManager, RoomClient } from "@/gateway/rooms/round-room"
import { wsIncomingSchema, WsOutgoingMessage } from "@/gateway/types/ws-events"
import { WsRateLimiter } from "@/gateway/rate-limit/ws-rate-limit"
import { handleBet } from "@/gateway/handlers/bet.handler"
import { handleCashout } from "@/gateway/handlers/cashout.handler"
import { handlePing } from "@/gateway/handlers/ping.handler"
import { REDIS_KEYS } from "@/services/game-round.service"
import { jsonUtf8 } from "@/lib/http"
import { createLogger } from "@/lib/logger"

const PORT = Number(process.env.GATEWAY_PORT ?? 8081)
const rooms = new RoundRoomManager()
const limiter = new WsRateLimiter()
const logger = createLogger("gateway")
const gatewayState = {
  bootedAt: Date.now(),
  ready: false,
}

async function resolveCurrentRound() {
  if (redis) {
    const roundId = await redis.get(REDIS_KEYS.currentRound)
    if (roundId) return roundId
  }

  const round = await db.round.findFirst({
    where: { status: { in: ["WAITING", "RUNNING", "CRASHED"] } },
    orderBy: { createdAt: "desc" },
  })
  return round?.id
}

async function boot() {
  const subscriber = createRedisSubscriber({ redisUrl: process.env.REDIS_URL, rooms })
  const server = http.createServer(async (req, res) => {
    if (req.url !== "/healthz") {
      res.statusCode = 404
      res.end("Not Found")
      return
    }

    let databaseOk = false
    try {
      await db.$queryRaw`SELECT 1`
      databaseOk = true
    } catch {
      databaseOk = false
    }

    const redisOk = await pingRedis()
    const subscriberStatus = subscriber?.status ?? "disabled"
    const ready =
      gatewayState.ready &&
      databaseOk &&
      redisOk &&
      isRedisConfigured() &&
      subscriberStatus !== "end"

    const payload = jsonUtf8(
      {
        ok: ready,
        status: ready ? "ready" : "degraded",
        service: "gateway",
        checks: {
          database: databaseOk,
          redis: redisOk,
          redisConfigured: isRedisConfigured(),
          redisStatus: getRedisStatus(),
          subscriberStatus,
        },
        serverTime: Date.now(),
      },
      { status: ready ? 200 : 503 },
    )

    res.statusCode = payload.status
    payload.headers.forEach((value, key) => {
      res.setHeader(key, value)
    })
    res.end(await payload.text())
  })
  const wss = new WebSocketServer({ server })

  const currentRound = await resolveCurrentRound()
  if (currentRound) rooms.setCurrentRound(currentRound)
  gatewayState.ready = true

  wss.on("connection", async (socket: WebSocket, req) => {
    const auth = await authenticateWs(req)
    if (!auth) {
      logger.warn("ws_auth_rejected", {
        route: "ws",
        remoteAddress: req.socket.remoteAddress ?? null,
      })
      socket.close(4001, "UNAUTHORIZED")
      return
    }

    const client: RoomClient = { userId: auth.userId, socket }
    const roundId = rooms.getCurrentRoundId()
    if (roundId) {
      rooms.getRoom(roundId).add(client)
      limiter.updateRound(auth.userId, roundId)

      const room = rooms.getRoom(roundId)
      if (room.statePayload && typeof room.statePayload.roundId === "string") {
        room.statePayload.onlineCount = room.onlineCount()
        const stateMessage: WsOutgoingMessage = {
          type: "round_state",
          payload: room.statePayload as any,
        }
        socket.send(JSON.stringify(stateMessage))
      } else if (room.state) {
        const stateMessage: WsOutgoingMessage = {
          type: "round_state",
          payload: { roundId, state: room.state, onlineCount: room.onlineCount() },
        }
        socket.send(JSON.stringify(stateMessage))
      }
      if (typeof room.multiplier === "number" && Number.isFinite(room.multiplier)) {
        socket.send(
          JSON.stringify({
            type: "multiplier_update",
            payload: { roundId, multiplier: room.multiplier, serverTs: room.multiplierTs ?? Date.now() },
          })
        )
      }
      rooms.broadcastCurrentOnlineCount()
    }

    socket.on("message", async (data) => {
      let message: unknown
      try {
        message = JSON.parse(data.toString())
      } catch {
        socket.send(JSON.stringify({ type: "error", payload: { code: "BAD_JSON", message: "Invalid JSON" } }))
        return
      }

      const parsed = wsIncomingSchema.safeParse(message)
      if (!parsed.success) {
        socket.send(JSON.stringify({ type: "error", payload: { code: "BAD_PAYLOAD", message: "Invalid payload" } }))
        return
      }

      const currentRoundId = rooms.getCurrentRoundId()
      limiter.updateRound(auth.userId, currentRoundId)

      switch (parsed.data.type) {
        case "bet": {
          if (!limiter.allowBet(auth.userId, currentRoundId)) {
            socket.send(JSON.stringify({ type: "error", payload: { code: "RATE_LIMIT", message: "Bet already sent" } }))
            return
          }
          const response = await handleBet(auth.userId, parsed.data.payload.amount, parsed.data.payload.currency)
          if (response) socket.send(JSON.stringify(response))
          return
        }
        case "cashout": {
          if (!limiter.allowCashout(auth.userId, currentRoundId)) {
            socket.send(JSON.stringify({ type: "error", payload: { code: "RATE_LIMIT", message: "Cashout already sent" } }))
            return
          }
          const response = await handleCashout(auth.userId, currentRoundId)
          socket.send(JSON.stringify(response))
          return
        }
        case "ping": {
          if (!limiter.allowPing(auth.userId)) return
          socket.send(JSON.stringify(handlePing()))
          return
        }
        default:
          socket.send(JSON.stringify({ type: "error", payload: { code: "UNKNOWN", message: "Unknown message" } }))
      }
    })

    socket.on("close", () => {
      limiter.remove(auth.userId)
      rooms.removeClient(client)
      rooms.broadcastCurrentOnlineCount()
    })
  })

  server.listen(PORT, () => {
    logger.info("gateway_listening", { port: PORT })
  })
}

boot().catch((error) => {
  logger.error("gateway_fatal", { error })
  process.exit(1)
})
