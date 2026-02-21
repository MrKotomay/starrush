import { z } from "zod"
import type {
  BackendPlayerBetEventPayload,
  BackendPlayerCashoutEventPayload,
  BackendRoundStatus,
} from "@/lib/game/backend-round-types"

export const wsIncomingSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("bet"),
    payload: z.object({
      amount: z.number().finite().positive(),
      currency: z.enum(["TON", "STARS"]),
    }),
  }),
  z.object({
    type: z.literal("cashout"),
    payload: z.object({}).optional().default({}),
  }),
  z.object({
    type: z.literal("ping"),
    payload: z.object({}).optional().default({}),
  }),
])

export type WsIncomingMessage = z.infer<typeof wsIncomingSchema>

export type WsRoundStatePayload = {
  roundId: string
  eventType?: string
  status?: BackendRoundStatus | string
  state?: string
  onlineCount?: number
  serverTime?: number
  currentMultiplier?: number
  startedAt?: number | null
  crashAt?: number | null
  endsAt?: number | null
  waitingEndsAt?: number | null
  crashMultiplier?: number | null
  serverSeedHash?: string
  fairnessVersion?: string
  fairnessNonce?: number
  clientSeed?: string | null
  effectiveClientSeed?: string
  serverSeed?: string
  houseEdge?: number
  maxCrash?: number
}

export type WsMultiplierUpdatePayload = {
  roundId: string
  multiplier: number
  serverTs?: number
}

export type WsOnlineCountPayload = {
  roundId: string
  onlineCount: number
}

export type WsOutgoingMessage =
  | { type: "round_state"; payload: WsRoundStatePayload }
  | { type: "multiplier_update"; payload: WsMultiplierUpdatePayload }
  | { type: "online_count"; payload: WsOnlineCountPayload }
  | { type: "player_bet"; payload: BackendPlayerBetEventPayload }
  | { type: "player_cashout"; payload: BackendPlayerCashoutEventPayload }
  | { type: "round_crashed"; payload: Record<string, unknown> }
  | { type: "round_finished"; payload: Record<string, unknown> }
  | { type: "error"; payload: { code: string; message: string } }
  | { type: "pong"; payload: { timestamp: number } }

export type WsRoundEventPayload = Record<string, unknown>

export type WsRoundEvent = {
  roundId: string
  eventType: string
  payload: WsRoundEventPayload
}
