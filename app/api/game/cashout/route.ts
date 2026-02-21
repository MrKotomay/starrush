import { getCurrentUser } from "@/lib/auth"
import { HouseInsufficientBankrollError } from "@/lib/house-ledger.service"
import { jsonUtf8 } from "@/lib/http"
import { rateLimit } from "@/lib/rate-limit"
import { REDIS_KEYS } from "@/services/game-round.service"
import { redis } from "@/lib/redis"
import {
  cashoutPlayer,
  RoundNotRunningError,
  PlayerAlreadyCashedOutError,
  PlayerNotFoundError,
  CashoutClosedError,
} from "@/services/game-settlement.service"

export async function POST() {
  const current = await getCurrentUser()
  if (!current) {
    return jsonUtf8({ ok: false, error: "UNAUTHORIZED" }, { status: 401 })
  }

  const rate = await rateLimit(`cashout:${current.user.id}`, 10, 10)
  if (!rate.allowed) {
    return jsonUtf8({ ok: false, error: "RATE_LIMIT" }, { status: 429 })
  }

  const roundId = redis ? await redis.get(REDIS_KEYS.currentRound) : null
  if (!roundId) {
    return jsonUtf8({ ok: false, error: "ROUND_NOT_RUNNING" }, { status: 409 })
  }

  try {
    const result = await cashoutPlayer(roundId, current.user.id)
    return jsonUtf8({ ok: true, cashout: result })
  } catch (error) {
    if (error instanceof RoundNotRunningError) {
      return jsonUtf8({ ok: false, error: "ROUND_NOT_RUNNING" }, { status: 409 })
    }
    if (error instanceof PlayerAlreadyCashedOutError) {
      return jsonUtf8({ ok: false, error: "ALREADY_CASHED_OUT" }, { status: 409 })
    }
    if (error instanceof PlayerNotFoundError) {
      return jsonUtf8({ ok: false, error: "BET_NOT_FOUND" }, { status: 404 })
    }
    if (error instanceof CashoutClosedError) {
      return jsonUtf8({ ok: false, error: "CASHOUT_CLOSED" }, { status: 409 })
    }
    if (error instanceof HouseInsufficientBankrollError) {
      return jsonUtf8({ ok: false, error: error.code, message: error.message }, { status: 409 })
    }

    console.error("[GameCashout] Unexpected error", error)
    const message =
      process.env.NODE_ENV === "development"
        ? error instanceof Error
          ? error.message
          : "Unknown server error"
        : undefined

    return jsonUtf8(
      message ? { ok: false, error: "SERVER_ERROR", message } : { ok: false, error: "SERVER_ERROR" },
      { status: 500 }
    )
  }
}
