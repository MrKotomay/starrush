import { Currency, RoundEventType } from "@prisma/client"
import {
  placeBet,
  BettingClosedError,
  DuplicateBetError,
  InsufficientBalanceError,
  InvalidBetAmountError,
  RiskLimitExceededError,
  RoundNotAcceptingBetsError,
} from "@/services/game-betting.service"
import { WsOutgoingMessage } from "@/gateway/types/ws-events"
import { emitGameEvent } from "@/services/game-events.service"
import { createPlayerBetEventPayload } from "@/services/game-player-events.service"

export async function handleBet(userId: string, amount: number, currency: Currency): Promise<WsOutgoingMessage | null> {
  try {
    const result = await placeBet(userId, amount, currency)
    const eventPayload = createPlayerBetEventPayload({
      roundId: result.roundId,
      betAmount: result.betAmount,
      currency: result.currency,
      placedAt: result.placedAt,
      publicPlayer: result.publicPlayer,
    })

    await emitGameEvent(result.roundId, RoundEventType.PLAYER_BET, eventPayload)

    return {
      type: "player_bet",
      payload: eventPayload,
    }
  } catch (error) {
    if (error instanceof InvalidBetAmountError) {
      return { type: "error", payload: { code: "INVALID_BET", message: "Invalid bet amount" } }
    }
    if (error instanceof InsufficientBalanceError) {
      return { type: "error", payload: { code: "INSUFFICIENT_FUNDS", message: "Insufficient balance" } }
    }
    if (error instanceof RoundNotAcceptingBetsError || error instanceof BettingClosedError) {
      return { type: "error", payload: { code: "ROUND_CLOSED", message: "Round not accepting bets" } }
    }
    if (error instanceof DuplicateBetError) {
      return { type: "error", payload: { code: "DUPLICATE_BET", message: "Bet already placed" } }
    }
    if (error instanceof RiskLimitExceededError) {
      return { type: "error", payload: { code: error.code, message: error.message } }
    }
    console.error("[Gateway] Bet failed", error)
    return { type: "error", payload: { code: "BET_FAILED", message: "Bet failed" } }
  }
}
