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
const MAX_CONNECTIONS_PER_USER = Number(process.env.MAX_WS_CONNECTIONS_PER_USER ?? 5)
const WS_HEARTBEAT_INTERVAL_MS = 30_000
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
    if (req.url === "/internal/stats") {
      const internalKey = req.headers["x-internal-key"]
      const expectedKey = process.env.INTERNAL_API_KEY ?? ""
      if (typeof internalKey !== "string" || expectedKey.length === 0 || internalKey !== expectedKey) {
        res.statusCode = 403
        res.end("Forbidden")
        return
      }

      const currentRoom = rooms.getCurrentRoom()
      const payload = jsonUtf8({
        ok: true,
        service: "gateway",
        ready: gatewayState.ready,
        bootedAt: gatewayState.bootedAt,
        currentRoundId: rooms.getCurrentRoundId() ?? null,
        roomCount: rooms.roomCount(),
        totalOpenConnections: rooms.totalOpenConnections(),
        onlineCount: currentRoom?.onlineCount() ?? 0,
      })

      res.statusCode = payload.status
      payload.headers.forEach((value, key) => {
        res.setHeader(key, value)
      })
      res.end(await payload.text())
      return
    }

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
  const wss = new WebSocketServer({ server, maxPayload: 4096 })

  const currentRound = await resolveCurrentRound()
  if (currentRound) rooms.setCurrentRound(currentRound)
  gatewayState.ready = true

  const allowedOrigins = (process.env.ALLOWED_WS_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean)

  wss.on("connection", async (socket: WebSocket, req) => {
    // Origin validation to prevent Cross-Site WebSocket Hijacking
    if (allowedOrigins.length > 0) {
      const origin = req.headers.origin ?? req.headers["sec-websocket-origin"]
      if (!origin || !allowedOrigins.includes(origin as string)) {
        logger.warn("ws_origin_rejected", { origin, remoteAddress: req.socket.remoteAddress })
        socket.close(4003, "ORIGIN_NOT_ALLOWED")
        return
      }
    }

    const auth = await authenticateWs(req)
    if (!auth) {
      logger.warn("ws_auth_rejected", {
        route: "ws",
        remoteAddress: req.socket.remoteAddress ?? null,
      })
      socket.close(4001, "UNAUTHORIZED")
      return
    }

    // Max connections per user
    const currentCount = rooms.connectionCountForUser(auth.userId)
    if (currentCount >= MAX_CONNECTIONS_PER_USER) {
      logger.warn("ws_max_connections", { userId: auth.userId, currentCount })
      socket.close(4008, "TOO_MANY_CONNECTIONS")
      return
    }

    // Mark alive for heartbeat
    const extSocket = socket as WebSocket & { isAlive?: boolean }
    extSocket.isAlive = true
    socket.on("pong", () => { extSocket.isAlive = true })

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

  // Server-side WebSocket heartbeat to detect dead connections
  const heartbeatInterval = setInterval(() => {
    for (const ws of wss.clients) {
      const extWs = ws as WebSocket & { isAlive?: boolean }
      if (extWs.isAlive === false) {
        extWs.terminate()
        continue
      }
      extWs.isAlive = false
      extWs.ping()
    }
    // Clean up stale rooms
    rooms.cleanupStaleRooms()
  }, WS_HEARTBEAT_INTERVAL_MS)

  wss.on("close", () => {
    clearInterval(heartbeatInterval)
  })
}

boot().catch((error) => {
  logger.error("gateway_fatal", { error })
  process.exit(1)
})

// Graceful shutdown
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, async () => {
    logger.info("gateway_shutting_down", { signal })
    try {
      await db.$disconnect()
    } catch {}
    process.exit(0)
  })
}
