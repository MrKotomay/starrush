import crypto from "crypto"
import { assertPaymentsSigningSecret } from "@/lib/payments/config"

const PAYLOAD_PREFIX = "sr1"

export function buildStarsInvoicePayload(input: {
  intentId: string
  userId: string
  telegramId: string
  amount: number
}) {
  const secret = assertPaymentsSigningSecret()
  const payloadCore = `${input.intentId}:${input.userId}:${input.telegramId}:${input.amount}`
  const signature = crypto.createHmac("sha256", secret).update(payloadCore).digest("hex").slice(0, 20)
  return `${PAYLOAD_PREFIX}:${input.intentId}:${signature}`
}

export function parseStarsInvoicePayload(payload: string): { intentId: string; signature: string } | null {
  const parts = payload.split(":")
  if (parts.length !== 3) return null
  if (parts[0] !== PAYLOAD_PREFIX) return null
  const intentId = parts[1]?.trim()
  const signature = parts[2]?.trim()
  if (!intentId || !signature) return null
  return { intentId, signature }
}

export function verifyStarsInvoicePayload(input: {
  payload: string
  intentId: string
  userId: string
  telegramId: string
  amount: number
}) {
  const parsed = parseStarsInvoicePayload(input.payload)
  if (!parsed) return false
  if (parsed.intentId !== input.intentId) return false

  const secret = assertPaymentsSigningSecret()
  const payloadCore = `${input.intentId}:${input.userId}:${input.telegramId}:${input.amount}`
  const expected = crypto.createHmac("sha256", secret).update(payloadCore).digest("hex").slice(0, 20)

  try {
    const left = Buffer.from(parsed.signature, "utf8")
    const right = Buffer.from(expected, "utf8")
    if (left.length !== right.length) return false
    return crypto.timingSafeEqual(left, right)
  } catch {
    return false
  }
}
