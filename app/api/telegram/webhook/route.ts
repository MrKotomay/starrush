import crypto from "crypto"
import { DepositProvider, DepositStatus, Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { jsonUtf8 } from "@/lib/http"
import { paymentsConfig, assertTelegramWebhookSecret } from "@/lib/payments/config"
import { completeDepositIntent } from "@/lib/payments/deposit-credit.service"
import { verifyStarsInvoicePayload, parseStarsInvoicePayload } from "@/lib/payments/signature"
import { answerPreCheckoutQuery, telegramWebhookUnauthorizedResponse } from "@/lib/payments/stars.service"
import { rateLimit } from "@/lib/rate-limit"
import {
  extractGiftStubPayload,
  extractPreCheckoutQuery,
  extractSuccessfulPayment,
  extractTelegramUpdateId,
} from "@/lib/payments/telegram-webhook.utils"

const TELEGRAM_SECRET_HEADER = "x-telegram-bot-api-secret-token"

function safeCompare(a: string, b: string) {
  try {
    const left = Buffer.from(a, "utf8")
    const right = Buffer.from(b, "utf8")
    if (left.length !== right.length) return false
    return crypto.timingSafeEqual(left, right)
  } catch {
    return false
  }
}

async function resolveIntentForPayload(invoicePayload: string) {
  const parsed = parseStarsInvoicePayload(invoicePayload)
  if (!parsed) return null

  const intent = await db.depositIntent.findUnique({
    where: { id: parsed.intentId },
    include: {
      user: {
        select: {
          id: true,
          telegramId: true,
        },
      },
    },
  })

  if (!intent) return null

  return { parsed, intent }
}

async function handlePreCheckout(update: unknown) {
  const preCheckout = extractPreCheckoutQuery(update)
  if (!preCheckout) return { handled: false }

  const resolved = await resolveIntentForPayload(preCheckout.invoicePayload)
  if (!resolved) {
    await answerPreCheckoutQuery({
      preCheckoutQueryId: preCheckout.id,
      ok: false,
      errorMessage: "Payment intent is invalid",
    })
    return { handled: true, intentId: null, ok: false, error: "INTENT_NOT_FOUND" }
  }

  const intent = resolved.intent
  const telegramId = String(intent.user.telegramId)
  const amount = Number(intent.amount.toString())

  const signatureOk = verifyStarsInvoicePayload({
    payload: preCheckout.invoicePayload,
    intentId: intent.id,
    userId: intent.userId,
    telegramId,
    amount,
  })

  const currencyOk = preCheckout.currency === "XTR"
  const amountOk = preCheckout.totalAmount === amount
  const userOk = preCheckout.fromId === telegramId
  const isExpired = intent.expiresAt <= new Date()
  const statusOk =
    intent.status === DepositStatus.WAITING_PAYMENT ||
    intent.status === DepositStatus.CREATED ||
    intent.status === DepositStatus.CONFIRMING

  const ok = signatureOk && currencyOk && amountOk && userOk && !isExpired && statusOk

  await answerPreCheckoutQuery({
    preCheckoutQueryId: preCheckout.id,
    ok,
    errorMessage: ok ? undefined : "Payment validation failed",
  })

  if (ok && intent.status !== DepositStatus.WAITING_PAYMENT) {
    await db.depositIntent.update({
      where: { id: intent.id },
      data: {
        status: DepositStatus.WAITING_PAYMENT,
        failureReason: null,
      },
    })
  }

  return {
    handled: true,
    intentId: intent.id,
    ok,
    error: ok ? null : "PRECHECK_VALIDATION_FAILED",
  }
}

async function handleSuccessfulPayment(update: unknown) {
  const payment = extractSuccessfulPayment(update)
  if (!payment) return { handled: false }

  const resolved = await resolveIntentForPayload(payment.invoicePayload)
  if (!resolved) {
    return { handled: true, intentId: null, ok: false, error: "INTENT_NOT_FOUND" }
  }

  const intent = resolved.intent
  const telegramId = String(intent.user.telegramId)
  const amount = Number(intent.amount.toString())

  const signatureOk = verifyStarsInvoicePayload({
    payload: payment.invoicePayload,
    intentId: intent.id,
    userId: intent.userId,
    telegramId,
    amount,
  })

  const currencyOk = payment.currency === "XTR"
  const amountOk = payment.totalAmount === amount
  const userOk = payment.fromId === telegramId

  if (!signatureOk || !currencyOk || !amountOk || !userOk) {
    await db.depositIntent.update({
      where: { id: intent.id },
      data: {
        status: DepositStatus.FAILED,
        failureReason: "Successful payment payload validation failed",
      },
    })

    return {
      handled: true,
      intentId: intent.id,
      ok: false,
      error: "PAYMENT_VALIDATION_FAILED",
    }
  }

  const paymentCharge = payment.telegramPaymentChargeId.trim().toLowerCase()

  const completed = await completeDepositIntent({
    intentId: intent.id,
    referenceId: `stars:${paymentCharge}`,
    providerPaymentId: payment.telegramPaymentChargeId,
    providerExternalId: payment.providerPaymentChargeId ?? null,
    providerPayload: payment.invoicePayload,
    metadata: {
      telegramPaymentChargeId: payment.telegramPaymentChargeId,
      providerPaymentChargeId: payment.providerPaymentChargeId ?? null,
      currency: payment.currency,
      totalAmount: payment.totalAmount,
    },
  })

  return {
    handled: true,
    intentId: intent.id,
    ok: completed.status === DepositStatus.COMPLETED,
    error: null,
  }
}

async function handleGiftStub(update: unknown, providerEventId: string) {
  if (!paymentsConfig.enableGiftsStub) return { handled: false }

  const gift = extractGiftStubPayload(update)
  if (!gift) return { handled: false }

  const fromTelegramId = gift.fromTelegramId ? BigInt(gift.fromTelegramId) : null
  const toTelegramId = gift.toTelegramId ? BigInt(gift.toTelegramId) : null

  const user = fromTelegramId
    ? await db.user.findUnique({
        where: { telegramId: fromTelegramId },
        select: { id: true },
      })
    : null

  const ingress = await db.giftIngressEvent.upsert({
    where: { providerEventId },
    update: {
      telegramGiftId: gift.telegramGiftId ?? null,
      fromTelegramId,
      toTelegramId,
      userId: user?.id ?? null,
      payload: gift.payload as Prisma.InputJsonValue,
    },
    create: {
      providerEventId,
      telegramGiftId: gift.telegramGiftId ?? null,
      fromTelegramId,
      toTelegramId,
      userId: user?.id ?? null,
      payload: gift.payload as Prisma.InputJsonValue,
    },
  })

  if (user?.id) {
    await db.userGiftStub.upsert({
      where: {
        userId_giftIngressEventId_giftType: {
          userId: user.id,
          giftIngressEventId: ingress.id,
          giftType: gift.giftType,
        },
      },
      update: {
        metadata: {
          telegramGiftId: gift.telegramGiftId ?? null,
          source: "telegram_webhook",
        },
      },
      create: {
        userId: user.id,
        giftIngressEventId: ingress.id,
        giftType: gift.giftType,
        quantity: 1,
        metadata: {
          telegramGiftId: gift.telegramGiftId ?? null,
          source: "telegram_webhook",
        },
      },
    })
  }

  return { handled: true, intentId: null, ok: true, error: null }
}

function detectEventType(update: unknown) {
  if (extractPreCheckoutQuery(update)) return "pre_checkout_query"
  if (extractSuccessfulPayment(update)) return "successful_payment"
  if (extractGiftStubPayload(update)) return "gift_stub"
  return "unknown"
}

export async function POST(req: Request) {
  let webhookSecret: string
  try {
    webhookSecret = assertTelegramWebhookSecret()
  } catch {
    return jsonUtf8({ ok: false, error: "WEBHOOK_SECRET_NOT_CONFIGURED" }, { status: 500 })
  }

  const incomingSecret = req.headers.get(TELEGRAM_SECRET_HEADER)?.trim() ?? ""
  if (!incomingSecret || !safeCompare(incomingSecret, webhookSecret)) {
    return telegramWebhookUnauthorizedResponse()
  }

  const update = await req.json().catch(() => null)
  if (!update) {
    return jsonUtf8({ ok: false, error: "INVALID_UPDATE" }, { status: 400 })
  }

  const updateId = extractTelegramUpdateId(update)

  // Rate limit by IP (not by updateId — each unique updateId gets its own bucket)
  const webhookIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "telegram-webhook"
  const webhookRate = await rateLimit(
    `telegram:webhook:${webhookIp}`,
    Math.max(10, paymentsConfig.depositRateLimitMax),
    paymentsConfig.depositRateLimitWindowSeconds
  )
  if (!webhookRate.allowed) {
    return jsonUtf8({ ok: false, error: "RATE_LIMIT" }, { status: 429 })
  }
  const eventType = detectEventType(update)

  let event
  try {
    event = await db.paymentProviderEvent.create({
      data: {
        provider: DepositProvider.TELEGRAM_STARS,
        eventId: updateId,
        eventType,
        payload: update as Prisma.InputJsonValue,
      },
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await db.paymentProviderEvent.findUnique({
        where: {
          provider_eventId: {
            provider: DepositProvider.TELEGRAM_STARS,
            eventId: updateId,
          },
        },
      })

      if (!existing) {
        return jsonUtf8({ ok: true, duplicate: true })
      }

      if (existing.status === "PROCESSED" || existing.status === "SKIPPED") {
        return jsonUtf8({ ok: true, duplicate: true })
      }

      event = existing
    } else {
      console.error("[TelegramWebhook] Event create failed", error)
      return jsonUtf8({ ok: false, error: "EVENT_SAVE_FAILED" }, { status: 500 })
    }
  }

  try {
    const preCheckoutResult = await handlePreCheckout(update)
    if (preCheckoutResult.handled) {
      await db.paymentProviderEvent.update({
        where: { id: event.id },
        data: {
          intentId: preCheckoutResult.intentId,
          status: preCheckoutResult.ok ? "PROCESSED" : "REJECTED",
          error: preCheckoutResult.error,
          processedAt: new Date(),
        },
      })
      return jsonUtf8({ ok: true })
    }

    const successfulPaymentResult = await handleSuccessfulPayment(update)
    if (successfulPaymentResult.handled) {
      await db.paymentProviderEvent.update({
        where: { id: event.id },
        data: {
          intentId: successfulPaymentResult.intentId,
          status: successfulPaymentResult.ok ? "PROCESSED" : "REJECTED",
          error: successfulPaymentResult.error,
          processedAt: new Date(),
        },
      })
      return jsonUtf8({ ok: true })
    }

    const giftResult = await handleGiftStub(update, `tg:${updateId}`)
    if (giftResult.handled) {
      await db.paymentProviderEvent.update({
        where: { id: event.id },
        data: {
          status: "PROCESSED",
          processedAt: new Date(),
        },
      })
      return jsonUtf8({ ok: true })
    }

    await db.paymentProviderEvent.update({
      where: { id: event.id },
      data: {
        status: "SKIPPED",
        processedAt: new Date(),
      },
    })

    return jsonUtf8({ ok: true, skipped: true })
  } catch (error) {
    console.error("[TelegramWebhook] Failed", error)
    await db.paymentProviderEvent.update({
      where: { id: event.id },
      data: {
        status: "FAILED",
        error: error instanceof Error ? error.message.slice(0, 240) : "UNKNOWN",
        processedAt: new Date(),
      },
    })

    return jsonUtf8({ ok: false, error: "WEBHOOK_PROCESSING_FAILED" }, { status: 500 })
  }
}
