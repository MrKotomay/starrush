import Redis from "ioredis"
import { RoundRoomManager } from "@/gateway/rooms/round-room"
import { WsOutgoingMessage, WsRoundEvent } from "@/gateway/types/ws-events"
import {
  BackendPlayerBetEventPayload,
  BackendPlayerCashoutEventPayload,
} from "@/lib/game/backend-round-types"
import { buildPublicPlayerProfile } from "@/lib/game/public-player"

const EVENTS_CHANNEL = "game:round:events"
const MULTIPLIER_PATTERN = "game:round:*:multiplier"

type SubscriberOptions = {
  redisUrl?: string
  rooms: RoundRoomManager
}

export function createRedisSubscriber(options: SubscriberOptions) {
  if (!options.redisUrl) return null
  const sub = new Redis(options.redisUrl)

  sub.on("error", (error) => {
    console.error("[Gateway] Redis subscriber error", error)
  })

  sub.subscribe(EVENTS_CHANNEL).catch((error) => {
    console.error("[Gateway] Redis subscribe failed", error)
  })

  sub.psubscribe(MULTIPLIER_PATTERN).catch((error) => {
    console.error("[Gateway] Redis psubscribe failed", error)
  })

  sub.on("message", (_channel, message) => {
    handleEventMessage(message, options.rooms)
  })

  sub.on("pmessage", (_pattern, channel, message) => {
    handleMultiplierMessage(channel, message, options.rooms)
  })

  return sub
}

function handleEventMessage(raw: string, rooms: RoundRoomManager) {
  try {
    const parsed = JSON.parse(raw) as WsRoundEvent
    const room = rooms.getRoom(parsed.roundId)
    if (["ROUND_WAITING", "ROUND_STARTED"].includes(parsed.eventType)) {
      rooms.setCurrentRound(parsed.roundId)
      rooms.moveAllToCurrent()
      rooms.broadcastCurrentOnlineCount()
    }

    const mapped = mapEvent(parsed)
    if (!mapped) return

    if (mapped.type === "round_state") {
      mapped.payload.onlineCount = room.onlineCount()
      room.statePayload = mapped.payload
      room.state = typeof mapped.payload.status === "string" ? mapped.payload.status : parsed.eventType
    } else if (mapped.type === "round_crashed") {
      room.state = "CRASHED"
    } else if (mapped.type === "round_finished") {
      room.state = "FINISHED"
    }

    room.broadcast(JSON.stringify(mapped))
  } catch (error) {
    console.error("[Gateway] Invalid event message", error)
  }
}

function handleMultiplierMessage(channel: string, raw: string, rooms: RoundRoomManager) {
  const match = channel.match(/game:round:(.*):multiplier/)
  if (!match) return
  const roundId = match[1]
  const multiplier = Number.parseFloat(raw)
  if (!Number.isFinite(multiplier)) return
  const room = rooms.getRoom(roundId)
  room.multiplier = multiplier
  room.multiplierTs = Date.now()
  const message: WsOutgoingMessage = {
    type: "multiplier_update",
    payload: { roundId, multiplier, serverTs: room.multiplierTs },
  }
  room.broadcast(JSON.stringify(message))
}

function mapEvent(event: WsRoundEvent): WsOutgoingMessage | null {
  const payload = event.payload ?? {}
  const now = Date.now()

  switch (event.eventType) {
    case "ROUND_WAITING": {
      const waitingEndsAt = toOptionalNumber(payload.waitingEndsAt)
      return {
        type: "round_state",
        payload: {
          roundId: event.roundId,
          eventType: "ROUND_WAITING",
          status: "WAITING",
          serverTime: toOptionalNumber(payload.serverTime) ?? now,
          currentMultiplier: toOptionalNumber(payload.currentMultiplier) ?? 1,
          startedAt: null,
          crashAt: null,
          endsAt: waitingEndsAt ?? null,
          waitingEndsAt: waitingEndsAt ?? null,
          crashMultiplier: null,
          serverSeedHash: toOptionalString(payload.serverSeedHash),
          fairnessVersion: toOptionalString(payload.fairnessVersion),
          fairnessNonce: toOptionalNumber(payload.fairnessNonce),
          clientSeed: toOptionalNullableString(payload.clientSeed),
          effectiveClientSeed: toOptionalString(payload.effectiveClientSeed),
          houseEdge: toOptionalNumber(payload.houseEdge),
          maxCrash: toOptionalNumber(payload.maxCrash),
        },
      }
    }
    case "ROUND_STARTED":
      return {
        type: "round_state",
        payload: {
          roundId: event.roundId,
          eventType: "ROUND_STARTED",
          status: "RUNNING",
          serverTime: toOptionalNumber(payload.serverTime) ?? now,
          currentMultiplier: toOptionalNumber(payload.currentMultiplier) ?? 1,
          startedAt: toOptionalNumber(payload.startedAt) ?? null,
          crashAt: null,
          endsAt: null,
          waitingEndsAt: null,
          crashMultiplier: null,
          serverSeedHash: toOptionalString(payload.serverSeedHash),
          fairnessVersion: toOptionalString(payload.fairnessVersion),
          fairnessNonce: toOptionalNumber(payload.fairnessNonce),
          clientSeed: toOptionalNullableString(payload.clientSeed),
          effectiveClientSeed: toOptionalString(payload.effectiveClientSeed),
          houseEdge: toOptionalNumber(payload.houseEdge),
          maxCrash: toOptionalNumber(payload.maxCrash),
        },
      }
    case "ROUND_CRASHED": {
      const crashMultiplier = toOptionalNumber(payload.crashMultiplier)
      return {
        type: "round_crashed",
        payload: {
          roundId: event.roundId,
          eventType: "ROUND_CRASHED",
          status: "CRASHED",
          serverTime: toOptionalNumber(payload.serverTime) ?? now,
          crashMultiplier,
          crashAt: toOptionalNumber(payload.crashAt) ?? now,
          endsAt: toOptionalNumber(payload.cooldownEndsAt) ?? null,
          serverSeedHash: toOptionalString(payload.serverSeedHash),
          serverSeed: toOptionalString(payload.serverSeed),
          fairnessVersion: toOptionalString(payload.fairnessVersion),
          fairnessNonce: toOptionalNumber(payload.fairnessNonce),
          clientSeed: toOptionalNullableString(payload.clientSeed),
          effectiveClientSeed: toOptionalString(payload.effectiveClientSeed),
          houseEdge: toOptionalNumber(payload.houseEdge),
          maxCrash: toOptionalNumber(payload.maxCrash),
        },
      }
    }
    case "ROUND_FINISHED":
      return {
        type: "round_finished",
        payload: {
          roundId: event.roundId,
          eventType: "ROUND_FINISHED",
          status: "FINISHED",
          serverTime: toOptionalNumber(payload.serverTime) ?? now,
          finishedAt: toOptionalNumber(payload.finishedAt) ?? now,
        },
      }
    case "MULTIPLIER_UPDATE":
      // Multiplier ticks are fanned out through pattern channel subscription.
      return null
    case "PLAYER_BET":
      return { type: "player_bet", payload: normalizePlayerBetPayload(event.roundId, payload) }
    case "PLAYER_CASHOUT":
      return { type: "player_cashout", payload: normalizePlayerCashoutPayload(event.roundId, payload) }
    default:
      return null
  }
}

function normalizePlayerBetPayload(
  roundId: string,
  payload: Record<string, unknown>,
): BackendPlayerBetEventPayload {
  const nestedPlayer = toOptionalRecord(payload.player)
  const fallbackUserId = `unknown-${roundId.slice(0, 6)}`
  const userId =
    toOptionalString(payload.userId) ??
    toOptionalString(nestedPlayer?.userId) ??
    fallbackUserId
  const profile = buildPublicPlayerProfile({
    userId,
    displayName: toOptionalString(payload.displayName) ?? toOptionalString(nestedPlayer?.displayName),
    username: toOptionalNullableString(payload.username) ?? toOptionalNullableString(nestedPlayer?.username),
    isHidden: toOptionalBoolean(payload.isHidden) ?? toOptionalBoolean(nestedPlayer?.isHidden),
    visibleToCurrentUserOnly:
      toOptionalBoolean(payload.visibleToCurrentUserOnly) ??
      toOptionalBoolean(nestedPlayer?.visibleToCurrentUserOnly),
    avatarUrl: toOptionalNullableString(payload.avatarUrl) ?? toOptionalNullableString(nestedPlayer?.avatarUrl),
  })

  const betAmountNumber =
    toOptionalNumber(payload.betAmount) ??
    toOptionalNumber(payload.amount) ??
    toOptionalNumber(nestedPlayer?.betAmount) ??
    toOptionalNumber(nestedPlayer?.amount) ??
    0
  const betAmount = typeof payload.betAmount === "string" ? payload.betAmount : betAmountNumber.toString()
  const amount = toOptionalNumber(payload.amount) ?? betAmountNumber
  const currency =
    toOptionalCurrency(payload.currency) ??
    toOptionalCurrency(nestedPlayer?.currency) ??
    "TON"
  const placedAt =
    toOptionalNumber(payload.placedAt) ??
    toOptionalNumber(nestedPlayer?.placedAt) ??
    Date.now()

  return {
    roundId,
    userId: profile.userId,
    displayName: profile.displayName,
    username: profile.username,
    isHidden: profile.isHidden,
    visibleToCurrentUserOnly: profile.visibleToCurrentUserOnly,
    avatarUrl: profile.avatarUrl,
    betAmount,
    amount,
    currency,
    placedAt,
  }
}

function normalizePlayerCashoutPayload(
  roundId: string,
  payload: Record<string, unknown>,
): BackendPlayerCashoutEventPayload {
  const nestedPlayer = toOptionalRecord(payload.player)
  const fallbackUserId = `unknown-${roundId.slice(0, 6)}`
  const userId =
    toOptionalString(payload.userId) ??
    toOptionalString(nestedPlayer?.userId) ??
    fallbackUserId
  const profile = buildPublicPlayerProfile({
    userId,
    displayName: toOptionalString(payload.displayName) ?? toOptionalString(nestedPlayer?.displayName),
    username: toOptionalNullableString(payload.username) ?? toOptionalNullableString(nestedPlayer?.username),
    isHidden: toOptionalBoolean(payload.isHidden) ?? toOptionalBoolean(nestedPlayer?.isHidden),
    visibleToCurrentUserOnly:
      toOptionalBoolean(payload.visibleToCurrentUserOnly) ??
      toOptionalBoolean(nestedPlayer?.visibleToCurrentUserOnly),
    avatarUrl: toOptionalNullableString(payload.avatarUrl) ?? toOptionalNullableString(nestedPlayer?.avatarUrl),
  })

  const betAmountNumber =
    toOptionalNumber(payload.betAmount) ??
    toOptionalNumber(payload.amount) ??
    toOptionalNumber(nestedPlayer?.betAmount) ??
    toOptionalNumber(nestedPlayer?.amount)
  const betAmount =
    typeof payload.betAmount === "string"
      ? payload.betAmount
      : betAmountNumber !== undefined
        ? betAmountNumber.toString()
        : null
  const amount = betAmountNumber ?? null
  const currency =
    toOptionalCurrency(payload.currency) ??
    toOptionalCurrency(nestedPlayer?.currency) ??
    null
  const multiplier =
    toOptionalNumber(payload.multiplier) ??
    toOptionalNumber(nestedPlayer?.cashoutMultiplier) ??
    1
  const payoutNumber =
    toOptionalNumber(payload.payout) ??
    toOptionalNumber(nestedPlayer?.payout) ??
    (amount !== null ? amount * multiplier : undefined)
  const profitNumber =
    toOptionalNumber(payload.profit) ??
    (payoutNumber !== undefined && amount !== null ? payoutNumber - amount : undefined)
  const payout = typeof payload.payout === "string" ? payload.payout : (payoutNumber ?? 0).toString()
  const profit = typeof payload.profit === "string" ? payload.profit : (profitNumber ?? 0).toString()
  const placedAt =
    toOptionalNumber(payload.placedAt) ??
    toOptionalNumber(nestedPlayer?.placedAt) ??
    null

  return {
    roundId,
    userId: profile.userId,
    displayName: profile.displayName,
    username: profile.username,
    isHidden: profile.isHidden,
    visibleToCurrentUserOnly: profile.visibleToCurrentUserOnly,
    avatarUrl: profile.avatarUrl,
    multiplier,
    payout,
    profit,
    betAmount,
    amount,
    currency,
    placedAt,
  }
}

function toOptionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function toOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

function toOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined
}

function toOptionalCurrency(value: unknown): "TON" | "STARS" | undefined {
  return value === "TON" || value === "STARS" ? value : undefined
}

function toOptionalRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined
}

function toOptionalNullableString(value: unknown): string | null | undefined {
  if (value === null) return null
  return typeof value === "string" ? value : undefined
}
