type RateState = {
  roundId?: string
  betUsed: boolean
  cashoutUsed: boolean
  pingCount: number
  pingWindowStart: number
}

const PING_WINDOW_MS = 10_000
const MAX_PINGS_PER_WINDOW = 20

export class WsRateLimiter {
  private readonly state = new Map<string, RateState>()

  private getState(userId: string) {
    let current = this.state.get(userId)
    if (!current) {
      current = {
        betUsed: false,
        cashoutUsed: false,
        pingCount: 0,
        pingWindowStart: Date.now(),
      }
      this.state.set(userId, current)
    }
    return current
  }

  updateRound(userId: string, roundId?: string) {
    const current = this.getState(userId)
    if (current.roundId !== roundId) {
      current.roundId = roundId
      current.betUsed = false
      current.cashoutUsed = false
    }
  }

  allowBet(userId: string, roundId?: string) {
    const current = this.getState(userId)
    if (roundId && current.roundId !== roundId) {
      this.updateRound(userId, roundId)
    }
    if (current.betUsed) return false
    current.betUsed = true
    return true
  }

  allowCashout(userId: string, roundId?: string) {
    const current = this.getState(userId)
    if (roundId && current.roundId !== roundId) {
      this.updateRound(userId, roundId)
    }
    if (current.cashoutUsed) return false
    current.cashoutUsed = true
    return true
  }

  allowPing(userId: string) {
    const current = this.getState(userId)
    const now = Date.now()
    if (now - current.pingWindowStart > PING_WINDOW_MS) {
      current.pingWindowStart = now
      current.pingCount = 0
    }
    current.pingCount += 1
    return current.pingCount <= MAX_PINGS_PER_WINDOW
  }

  remove(userId: string) {
    this.state.delete(userId)
  }
}
