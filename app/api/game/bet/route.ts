import { z } from "zod"
import { Currency, RoundEventType } from "@prisma/client"
import { getCurrentUser } from "@/lib/auth"
import { jsonUtf8 } from "@/lib/http"
import { rateLimit } from "@/lib/rate-limit"
import { emitGameEvent } from "@/services/game-events.service"
import { createPlayerBetEventPayload } from "@/services/game-player-events.service"
import {
  placeBet,
  DuplicateBetError,
  QueuedBetAlreadyExistsError,
  InsufficientBalanceError,
  InvalidBetAmountError,
  RoundNotAcceptingBetsError,
  BettingClosedError,
  RiskLimitExceededError,
} from "@/services/game-betting.service"

const schema = z.object({
  amount: z.number().positive(),
  currency: z.nativeEnum(Currency),
}).superRefine((value, ctx) => {
  if (value.currency === Currency.STARS && !Number.isInteger(value.amount)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["amount"],
      message: "Stars bets must be whole numbers",
    })
  }
})

export async function POST(req: Request) {
  const current = await getCurrentUser()
  if (!current) {
    return jsonUtf8({ ok: false, error: "UNAUTHORIZED" }, { status: 401 })
  }

  const rate = await rateLimit(`bet:${current.user.id}`, 10, 10)
  if (!rate.allowed) {
    return jsonUtf8({ ok: false, error: "RATE_LIMIT" }, { status: 429 })
  }

  const body = await req.json().catch(() => ({}))
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return jsonUtf8({ ok: false, error: "INVALID_INPUT" }, { status: 400 })
  }

  try {
    const result = await placeBet(current.user.id, parsed.data.amount, parsed.data.currency)
    if (result.mode === "active") {
      const eventPayload = createPlayerBetEventPayload({
        roundId: result.roundId,
        betAmount: result.betAmount,
        currency: result.currency,
        placedAt: result.placedAt,
        publicPlayer: result.publicPlayer,
      })
      await emitGameEvent(result.roundId, RoundEventType.PLAYER_BET, eventPayload)
    }

    return jsonUtf8({ ok: true, bet: result })
  } catch (error) {
    if (error instanceof InvalidBetAmountError) {
      return jsonUtf8({ ok: false, error: "INVALID_BET_AMOUNT" }, { status: 400 })
    }
    if (error instanceof RoundNotAcceptingBetsError) {
      return jsonUtf8({ ok: false, error: "ROUND_NOT_ACCEPTING_BETS" }, { status: 409 })
    }
    if (error instanceof BettingClosedError) {
      return jsonUtf8({ ok: false, error: "BETTING_CLOSED" }, { status: 409 })
    }
    if (error instanceof InsufficientBalanceError) {
      return jsonUtf8({ ok: false, error: "INSUFFICIENT_BALANCE" }, { status: 402 })
    }
    if (error instanceof DuplicateBetError) {
      return jsonUtf8({ ok: false, error: "DUPLICATE_BET" }, { status: 409 })
    }
    if (error instanceof QueuedBetAlreadyExistsError) {
      return jsonUtf8({ ok: false, error: "QUEUED_BET_EXISTS" }, { status: 409 })
    }
    if (error instanceof RiskLimitExceededError) {
      return jsonUtf8({ ok: false, error: error.code, message: error.message }, { status: 409 })
    }

    console.error("[GameBet] Unexpected error", error)
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
