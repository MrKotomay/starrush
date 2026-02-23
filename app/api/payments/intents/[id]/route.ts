import { getCurrentUser } from "@/lib/auth"
import { jsonUtf8 } from "@/lib/http"
import { paymentsConfig } from "@/lib/payments/config"
import { getUserIntent, markIntentExpiredIfNeeded } from "@/lib/payments/intents.service"
import { rateLimit } from "@/lib/rate-limit"

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function GET(_req: Request, context: RouteContext) {
  const current = await getCurrentUser()
  if (!current) {
    return jsonUtf8({ ok: false, error: "UNAUTHORIZED" }, { status: 401 })
  }

  const rate = await rateLimit(
    `payments:intent:get:${current.user.id}`,
    paymentsConfig.depositRateLimitMax * 3,
    paymentsConfig.depositRateLimitWindowSeconds
  )
  if (!rate.allowed) {
    return jsonUtf8({ ok: false, error: "RATE_LIMIT" }, { status: 429 })
  }

  const { id } = await context.params
  const intent = await getUserIntent({ userId: current.user.id, intentId: id })
  if (!intent) {
    return jsonUtf8({ ok: false, error: "INTENT_NOT_FOUND" }, { status: 404 })
  }

  const freshIntent = await markIntentExpiredIfNeeded(intent.id)
  const result = freshIntent ?? intent

  return jsonUtf8({
    ok: true,
    intent: {
      id: result.id,
      provider: result.provider,
      currency: result.currency,
      status: result.status,
      amount: result.amount.toString(),
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
      expiresAt: result.expiresAt,
      failureReason: result.failureReason,
      txHash: result.txHash,
    },
  })
}
