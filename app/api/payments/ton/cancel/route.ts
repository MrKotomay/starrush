import { z } from "zod"
import { DepositProvider, DepositStatus } from "@prisma/client"
import { getCurrentUser } from "@/lib/auth"
import { jsonUtf8 } from "@/lib/http"
import { paymentsConfig } from "@/lib/payments/config"
import { getUserIntent, setIntentStatus } from "@/lib/payments/intents.service"
import { rateLimit } from "@/lib/rate-limit"

const schema = z.object({
  intentId: z.string().min(1),
  reason: z.string().trim().max(128).optional(),
})

function mapCancelReason(reason: string | undefined) {
  if (reason === "USER_REJECTED") {
    return "User rejected transaction in wallet"
  }
  return "Payment canceled"
}

export async function POST(req: Request) {
  if (!paymentsConfig.enableTonConnectDeposits) {
    return jsonUtf8({ ok: false, error: "TON_DEPOSITS_DISABLED" }, { status: 403 })
  }

  const current = await getCurrentUser()
  if (!current) {
    return jsonUtf8({ ok: false, error: "UNAUTHORIZED" }, { status: 401 })
  }

  const rate = await rateLimit(
    `payments:ton:cancel:${current.user.id}`,
    paymentsConfig.depositRateLimitMax,
    paymentsConfig.depositRateLimitWindowSeconds
  )

  if (!rate.allowed) {
    return jsonUtf8({ ok: false, error: "RATE_LIMIT" }, { status: 429 })
  }

  const body = await req.json().catch(() => ({}))
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return jsonUtf8({ ok: false, error: "INVALID_INPUT" }, { status: 400 })
  }

  const intent = await getUserIntent({
    userId: current.user.id,
    intentId: parsed.data.intentId,
  })

  if (!intent) {
    return jsonUtf8({ ok: false, error: "INTENT_NOT_FOUND" }, { status: 404 })
  }

  if (intent.provider !== DepositProvider.TON_CONNECT) {
    return jsonUtf8({ ok: false, error: "INTENT_NOT_TON" }, { status: 409 })
  }

  if (
    intent.status === DepositStatus.SUBMITTED ||
    intent.status === DepositStatus.CONFIRMING ||
    intent.status === DepositStatus.COMPLETED
  ) {
    return jsonUtf8({
      ok: true,
      intent: {
        id: intent.id,
        status: intent.status,
        failureReason: intent.failureReason,
      },
    })
  }

  if (
    intent.status === DepositStatus.FAILED ||
    intent.status === DepositStatus.EXPIRED ||
    intent.status === DepositStatus.CANCELED
  ) {
    return jsonUtf8({
      ok: true,
      intent: {
        id: intent.id,
        status: intent.status,
        failureReason: intent.failureReason,
      },
    })
  }

  const canceled = await setIntentStatus({
    intentId: intent.id,
    status: DepositStatus.CANCELED,
    failureReason: mapCancelReason(parsed.data.reason),
  })

  return jsonUtf8({
    ok: true,
    intent: {
      id: canceled.id,
      status: canceled.status,
      failureReason: canceled.failureReason,
    },
  })
}
