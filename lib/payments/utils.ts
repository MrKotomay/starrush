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
