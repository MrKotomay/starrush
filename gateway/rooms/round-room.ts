import WebSocket from "ws"
import type { WsOutgoingMessage } from "@/gateway/types/ws-events"

export type RoomClient = {
  userId: string
  socket: WebSocket
}

export class RoundRoom {
  readonly roundId: string
  readonly clients = new Set<RoomClient>()
  state?: string
  statePayload?: Record<string, unknown>
  multiplier?: number
  multiplierTs?: number

  constructor(roundId: string) {
    this.roundId = roundId
  }

  add(client: RoomClient) {
    this.clients.add(client)
  }

  remove(client: RoomClient) {
    this.clients.delete(client)
  }

  broadcast(message: string) {
    for (const client of this.clients) {
      if (client.socket.readyState === WebSocket.OPEN) {
        client.socket.send(message)
      }
    }
  }

  onlineCount(): number {
    const uniqueUsers = new Set<string>()
    for (const client of this.clients) {
      if (client.socket.readyState === WebSocket.OPEN) {
        uniqueUsers.add(client.userId)
      }
    }
    return uniqueUsers.size
  }

  broadcastOnlineCount() {
    const message: WsOutgoingMessage = {
      type: "online_count",
      payload: {
        roundId: this.roundId,
        onlineCount: this.onlineCount(),
      },
    }
    this.broadcast(JSON.stringify(message))
  }
}

export class RoundRoomManager {
  private rooms = new Map<string, RoundRoom>()
  private currentRoundId?: string

  getRoom(roundId: string) {
    let room = this.rooms.get(roundId)
    if (!room) {
      room = new RoundRoom(roundId)
      this.rooms.set(roundId, room)
    }
    return room
  }

  setCurrentRound(roundId: string) {
    this.currentRoundId = roundId
  }

  getCurrentRoundId() {
    return this.currentRoundId
  }

  moveClientToCurrent(client: RoomClient) {
    if (!this.currentRoundId) return
    for (const room of this.rooms.values()) {
      if (room.clients.has(client)) {
        room.remove(client)
      }
    }
    this.getRoom(this.currentRoundId).add(client)
  }

  moveAllToCurrent() {
    if (!this.currentRoundId) return
    const target = this.getRoom(this.currentRoundId)
    for (const room of this.rooms.values()) {
      if (room === target) continue
      for (const client of room.clients) {
        room.remove(client)
        target.add(client)
      }
    }
  }

  removeClient(client: RoomClient) {
    for (const room of this.rooms.values()) {
      if (room.clients.has(client)) {
        room.remove(client)
      }
    }
  }

  getCurrentRoom(): RoundRoom | null {
    if (!this.currentRoundId) return null
    return this.getRoom(this.currentRoundId)
  }

  broadcastCurrentOnlineCount() {
    this.getCurrentRoom()?.broadcastOnlineCount()
  }

  cleanupStaleRooms() {
    const current = this.currentRoundId
    for (const [roundId, room] of this.rooms) {
      if (roundId === current) continue
      if (room.clients.size === 0) {
        this.rooms.delete(roundId)
      }
    }
  }

  connectionCountForUser(userId: string): number {
    let count = 0
    for (const room of this.rooms.values()) {
      for (const client of room.clients) {
        if (client.userId === userId && client.socket.readyState === WebSocket.OPEN) {
          count++
        }
      }
    }
    return count
  }

  roomCount(): number {
    return this.rooms.size
  }

  totalOpenConnections(): number {
    let count = 0
    for (const room of this.rooms.values()) {
      for (const client of room.clients) {
        if (client.socket.readyState === WebSocket.OPEN) {
          count += 1
        }
      }
    }
    return count
  }
}
