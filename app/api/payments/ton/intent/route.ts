import { z } from "zod"
import { getCurrentUser } from "@/lib/auth"
import { jsonUtf8 } from "@/lib/http"
import { paymentsConfig, assertTonDepositAddressForTransfer } from "@/lib/payments/config"
import { createTonDepositIntent } from "@/lib/payments/intents.service"
import { buildTonConnectCommentPayload, buildTonDepositComment } from "@/lib/payments/ton.service"
import { tonAmountToNano } from "@/lib/payments/utils"
import { rateLimit } from "@/lib/rate-limit"

const schema = z.object({
  amount: z.string().min(1),
  senderAddress: z.string().min(8).max(128),
})

export async function POST(req: Request) {
  if (!paymentsConfig.enableTonConnectDeposits) {
    return jsonUtf8({ ok: false, error: "TON_DEPOSITS_DISABLED" }, { status: 403 })
  }

  const current = await getCurrentUser()
  if (!current) {
    return jsonUtf8({ ok: false, error: "UNAUTHORIZED" }, { status: 401 })
  }

  const rate = await rateLimit(
    `payments:ton:intent:${current.user.id}`,
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

  try {
    const intent = await createTonDepositIntent({
      userId: current.user.id,
      amountRaw: parsed.data.amount,
      senderAddress: parsed.data.senderAddress,
    })

    const amountNano = tonAmountToNano(parsed.data.amount).toString()
    const recipientAddress = assertTonDepositAddressForTransfer()
    const comment = buildTonDepositComment(intent.id)
    const payload = buildTonConnectCommentPayload(comment)

    return jsonUtf8({
      ok: true,
      intent: {
        id: intent.id,
        status: intent.status,
        amountTon: intent.amount.toString(),
        amountNano,
        currency: intent.currency,
        expiresAt: intent.expiresAt,
      },
      tonConnectRequest: {
        validUntil: Math.floor(intent.expiresAt.getTime() / 1000),
        messages: [
          {
            address: recipientAddress,
            amount: amountNano,
            payload,
          },
        ],
      },
    })
  } catch (error) {
    console.error("[Payments][TonIntent] Failed", error)
    if (error instanceof Error && (error.message === "INVALID_TON_AMOUNT" || error.message === "INVALID_TON_PRECISION")) {
      return jsonUtf8({ ok: false, error: error.message }, { status: 400 })
    }
    if (error instanceof Error && error.message === "TON_LIMITS_EXCEEDED") {
      return jsonUtf8({ ok: false, error: "TON_LIMITS_EXCEEDED" }, { status: 400 })
    }
    if (
      error instanceof Error &&
      (error.message === "TON_DEPOSIT_ADDRESS_NOT_CONFIGURED" || error.message === "TON_DEPOSIT_ADDRESS_INVALID")
    ) {
      return jsonUtf8({ ok: false, error: error.message }, { status: 500 })
    }
    return jsonUtf8({ ok: false, error: "TON_INTENT_CREATE_FAILED" }, { status: 500 })
  }
}
