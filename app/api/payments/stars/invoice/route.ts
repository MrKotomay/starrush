import { DepositStatus } from "@prisma/client"
import { z } from "zod"
import { getCurrentUser } from "@/lib/auth"
import { db } from "@/lib/db"
import { jsonUtf8 } from "@/lib/http"
import { createStarsDepositIntent } from "@/lib/payments/intents.service"
import { paymentsConfig } from "@/lib/payments/config"
import { buildStarsInvoicePayload } from "@/lib/payments/signature"
import { createStarsInvoiceLink } from "@/lib/payments/stars.service"
import { rateLimit } from "@/lib/rate-limit"

const schema = z.object({
  amount: z.number().int().positive(),
})

export async function POST(req: Request) {
  if (!paymentsConfig.enableStarsPayments) {
    return jsonUtf8({ ok: false, error: "STARS_PAYMENTS_DISABLED" }, { status: 403 })
  }

  const current = await getCurrentUser()
  if (!current) {
    return jsonUtf8({ ok: false, error: "UNAUTHORIZED" }, { status: 401 })
  }

  const rate = await rateLimit(
    `payments:stars:invoice:${current.user.id}`,
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
    const intent = await createStarsDepositIntent({
      userId: current.user.id,
      amount: parsed.data.amount,
    })

    const telegramId = String(current.user.telegramId)
    const invoicePayload = buildStarsInvoicePayload({
      intentId: intent.id,
      userId: current.user.id,
      telegramId,
      amount: parsed.data.amount,
    })

    let invoiceUrl: string
    try {
      invoiceUrl = await createStarsInvoiceLink({
        amount: parsed.data.amount,
        invoicePayload,
      })
    } catch (error) {
      await db.depositIntent.update({
        where: { id: intent.id },
        data: {
          status: DepositStatus.FAILED,
          failureReason: "Invoice create failed",
        },
      })
      throw error
    }

    const updatedIntent = await db.depositIntent.update({
      where: { id: intent.id },
      data: {
        providerPayload: invoicePayload,
        status: DepositStatus.WAITING_PAYMENT,
      },
    })

    return jsonUtf8({
      ok: true,
      intent: {
        id: updatedIntent.id,
        status: updatedIntent.status,
        amount: updatedIntent.amount.toString(),
        currency: updatedIntent.currency,
        expiresAt: updatedIntent.expiresAt,
      },
      invoiceUrl,
    })
  } catch (error) {
    console.error("[Payments][StarsInvoice] Failed", error)
    if (error instanceof Error && error.message === "STARS_LIMITS_EXCEEDED") {
      return jsonUtf8({ ok: false, error: "STARS_LIMITS_EXCEEDED" }, { status: 400 })
    }
    if (error instanceof Error && error.message === "INVALID_STARS_AMOUNT") {
      return jsonUtf8({ ok: false, error: "INVALID_STARS_AMOUNT" }, { status: 400 })
    }
    return jsonUtf8({ ok: false, error: "INVOICE_CREATE_FAILED" }, { status: 500 })
  }
}
