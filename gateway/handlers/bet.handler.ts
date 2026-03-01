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
import { createLogger } from "@/lib/logger"

const logger = createLogger("gateway-bet")

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
      logger.warn("bet_rejected", { userId, errorCode: "INVALID_BET", amount, currency })
      return { type: "error", payload: { code: "INVALID_BET", message: "Invalid bet amount" } }
    }
    if (error instanceof InsufficientBalanceError) {
      logger.warn("bet_rejected", { userId, errorCode: "INSUFFICIENT_FUNDS", amount, currency })
      return { type: "error", payload: { code: "INSUFFICIENT_FUNDS", message: "Insufficient balance" } }
    }
    if (error instanceof RoundNotAcceptingBetsError || error instanceof BettingClosedError) {
      logger.warn("bet_rejected", { userId, errorCode: "ROUND_CLOSED", amount, currency })
      return { type: "error", payload: { code: "ROUND_CLOSED", message: "Round not accepting bets" } }
    }
    if (error instanceof DuplicateBetError) {
      logger.warn("bet_rejected", { userId, errorCode: "DUPLICATE_BET", amount, currency })
      return { type: "error", payload: { code: "DUPLICATE_BET", message: "Bet already placed" } }
    }
    if (error instanceof RiskLimitExceededError) {
      logger.warn("bet_rejected", { userId, errorCode: error.code, amount, currency })
      return { type: "error", payload: { code: error.code, message: error.message } }
    }
    logger.error("bet_failed", { userId, amount, currency, error })
    return { type: "error", payload: { code: "BET_FAILED", message: "Bet failed" } }
  }
}
