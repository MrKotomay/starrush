import { HouseInsufficientBankrollError } from "@/lib/house-ledger.service"
import { cashoutPlayer, CashoutClosedError, PlayerAlreadyCashedOutError, PlayerNotFoundError, RoundNotRunningError } from "@/services/game-settlement.service"
import { WsOutgoingMessage } from "@/gateway/types/ws-events"
import { createPlayerCashoutEventPayload } from "@/services/game-player-events.service"
import { createLogger } from "@/lib/logger"

const logger = createLogger("gateway-cashout")

export async function handleCashout(userId: string, roundId?: string): Promise<WsOutgoingMessage> {
  if (!roundId) {
    return { type: "error", payload: { code: "NO_ROUND", message: "No active round" } }
  }

  try {
    const result = await cashoutPlayer(roundId, userId)
    return {
      type: "player_cashout",
      payload: createPlayerCashoutEventPayload({
        roundId: result.roundId,
        multiplier: result.multiplier,
        payout: result.payout,
        profit: result.profit,
        betAmount: result.betAmount,
        currency: result.currency,
        placedAt: result.placedAt,
        publicPlayer: result.publicPlayer,
      }),
    }
  } catch (error) {
    if (error instanceof RoundNotRunningError || error instanceof CashoutClosedError) {
      logger.warn("cashout_rejected", { userId, roundId, errorCode: "ROUND_NOT_RUNNING" })
      return { type: "error", payload: { code: "ROUND_NOT_RUNNING", message: "Round not running" } }
    }
    if (error instanceof PlayerAlreadyCashedOutError) {
      logger.warn("cashout_rejected", { userId, roundId, errorCode: "ALREADY_CASHED_OUT" })
      return { type: "error", payload: { code: "ALREADY_CASHED_OUT", message: "Already cashed out" } }
    }
    if (error instanceof PlayerNotFoundError) {
      logger.warn("cashout_rejected", { userId, roundId, errorCode: "PLAYER_NOT_FOUND" })
      return { type: "error", payload: { code: "PLAYER_NOT_FOUND", message: "Player not found" } }
    }
    if (error instanceof HouseInsufficientBankrollError) {
      logger.warn("cashout_rejected", { userId, roundId, errorCode: error.code })
      return { type: "error", payload: { code: error.code, message: error.message } }
    }
    logger.error("cashout_failed", { userId, roundId, error })
    return { type: "error", payload: { code: "CASHOUT_FAILED", message: "Cashout failed" } }
  }
}
