export type TelegramPreCheckoutQuery = {
  id: string
  fromId: string
  currency: string
  totalAmount: number
  invoicePayload: string
}

export type TelegramSuccessfulPayment = {
  fromId: string
  currency: string
  totalAmount: number
  invoicePayload: string
  telegramPaymentChargeId: string
  providerPaymentChargeId?: string | null
}

export type TelegramGiftStubPayload = {
  giftType: string
  telegramGiftId?: string | null
  fromTelegramId?: string | null
  toTelegramId?: string | null
  payload: Record<string, unknown>
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function toStringValue(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed ? trimmed : null
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value))
  }
  if (typeof value === "bigint") return value.toString()
  return null
}

function toNumberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value)
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

export function extractPreCheckoutQuery(update: unknown): TelegramPreCheckoutQuery | null {
  const record = toRecord(update)
  const preCheckout = toRecord(record?.pre_checkout_query)
  if (!preCheckout) return null

  const from = toRecord(preCheckout.from)
  const id = toStringValue(preCheckout.id)
  const fromId = toStringValue(from?.id)
  const currency = toStringValue(preCheckout.currency)
  const totalAmount = toNumberValue(preCheckout.total_amount)
  const invoicePayload = toStringValue(preCheckout.invoice_payload)

  if (!id || !fromId || !currency || totalAmount === null || !invoicePayload) {
    return null
  }

  return {
    id,
    fromId,
    currency,
    totalAmount,
    invoicePayload,
  }
}

export function extractSuccessfulPayment(update: unknown): TelegramSuccessfulPayment | null {
  const record = toRecord(update)
  const message = toRecord(record?.message)
  const payment = toRecord(message?.successful_payment)
  if (!message || !payment) return null

  const from = toRecord(message.from)
  const fromId = toStringValue(from?.id)
  const currency = toStringValue(payment.currency)
  const totalAmount = toNumberValue(payment.total_amount)
  const invoicePayload = toStringValue(payment.invoice_payload)
  const telegramPaymentChargeId = toStringValue(payment.telegram_payment_charge_id)
  const providerPaymentChargeId = toStringValue(payment.provider_payment_charge_id)

  if (!fromId || !currency || totalAmount === null || !invoicePayload || !telegramPaymentChargeId) {
    return null
  }

  return {
    fromId,
    currency,
    totalAmount,
    invoicePayload,
    telegramPaymentChargeId,
    providerPaymentChargeId,
  }
}

export function extractGiftStubPayload(update: unknown): TelegramGiftStubPayload | null {
  const record = toRecord(update)
  const message = toRecord(record?.message)
  if (!message) return null

  const gift = toRecord(message.gift)
  const uniqueGift = toRecord(message.unique_gift)
  const giftInfo = toRecord(message.gift_info)

  const sourceGift = gift ?? uniqueGift ?? giftInfo
  if (!sourceGift) return null

  const from = toRecord(message.from)
  const chat = toRecord(message.chat)

  const fromTelegramId = toStringValue(from?.id)
  const toTelegramId = toStringValue(chat?.id)
  const telegramGiftId =
    toStringValue(sourceGift.id) ??
    toStringValue(sourceGift.gift_id) ??
    toStringValue(sourceGift.slug)

  const giftType = gift ? "gift" : uniqueGift ? "unique_gift" : "gift_info"

  return {
    giftType,
    telegramGiftId,
    fromTelegramId,
    toTelegramId,
    payload: {
      message,
      selectedGift: sourceGift,
    },
  }
}

export function extractTelegramUpdateId(update: unknown) {
  const record = toRecord(update)
  const updateId = toStringValue(record?.update_id)
  return updateId ?? `unknown:${Date.now()}`
}
