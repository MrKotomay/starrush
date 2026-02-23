import crypto from "crypto"
import { DepositStatus, Prisma } from "@prisma/client"

const NANO_FACTOR = BigInt("1000000000")

export function normalizeAddress(value: string) {
  return value.trim().toLowerCase()
}

export function isTerminalStatus(status: DepositStatus) {
  return (
    status === DepositStatus.COMPLETED ||
    status === DepositStatus.FAILED ||
    status === DepositStatus.EXPIRED ||
    status === DepositStatus.CANCELED
  )
}

export function tonAmountToNano(amount: string): bigint {
  const normalized = amount.trim()
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error("INVALID_TON_AMOUNT")
  }

  const [wholeRaw, fractionRaw = ""] = normalized.split(".")
  if (fractionRaw.length > 9) {
    throw new Error("INVALID_TON_PRECISION")
  }

  const whole = BigInt(wholeRaw)
  const fraction = BigInt((fractionRaw + "000000000").slice(0, 9))
  const nano = whole * NANO_FACTOR + fraction
  if (nano <= BigInt(0)) {
    throw new Error("INVALID_TON_AMOUNT")
  }
  return nano
}

export function nanoToTonDecimal(nano: bigint): Prisma.Decimal {
  if (nano < BigInt(0)) {
    throw new Error("INVALID_NANO_AMOUNT")
  }

  const whole = nano / NANO_FACTOR
  const fraction = nano % NANO_FACTOR
  const fractionRaw = fraction.toString().padStart(9, "0")
  const amount = `${whole.toString()}.${fractionRaw}`
  return new Prisma.Decimal(amount)
}

export function toBigIntValue(value: unknown): bigint | null {
  if (typeof value === "bigint") return value
  if (typeof value === "number" && Number.isFinite(value) && Number.isInteger(value)) {
    return BigInt(value)
  }
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    return BigInt(value)
  }
  return null
}

export function clampText(value: string, maxLength: number) {
  const trimmed = value.trim()
  if (trimmed.length <= maxLength) return trimmed
  return trimmed.slice(0, maxLength)
}

const LEDGER_REFERENCE_MAX_LENGTH = 128

export function buildSafeLedgerReferenceId(rawReferenceId: string) {
  const referenceId = rawReferenceId.trim()
  if (!referenceId) {
    throw new Error("INVALID_REFERENCE_ID")
  }

  if (referenceId.length <= LEDGER_REFERENCE_MAX_LENGTH) {
    return referenceId
  }

  const prefix = referenceId.split(":")[0]?.trim().toLowerCase() || "ref"
  const hash = crypto.createHash("sha256").update(referenceId).digest("hex")
  const hashedReference = `${prefix}:h:${hash}`

  if (hashedReference.length <= LEDGER_REFERENCE_MAX_LENGTH) {
    return hashedReference
  }

  return `h:${hash}`
}
