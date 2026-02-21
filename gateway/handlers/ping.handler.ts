import { WsOutgoingMessage } from "@/gateway/types/ws-events"

export function handlePing(): WsOutgoingMessage {
  return { type: "pong", payload: { timestamp: Date.now() } }
}
