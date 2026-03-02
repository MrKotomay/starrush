import crypto from "crypto"
import { Currency, DepositProvider, DepositStatus, Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { paymentsConfig, assertTonDepositAddress } from "@/lib/payments/config"
import { buildTonDepositComment } from "@/lib/payments/ton.service"
import { isTerminalStatus, tonAmountToNano } from "@/lib/payments/utils"

function buildPendingLedgerReference(prefix: "stars" | "ton") {
  return `${prefix}:pending:${Date.now()}:${crypto.randomUUID().slice(0, 8)}`
}

export function validateStarsAmount(amount: number) {
  if (!Number.isInteger(amount)) {
    throw new Error("INVALID_STARS_AMOUNT")
  }
  if (amount < paymentsConfig.depositLimitsStarsMin || amount > paymentsConfig.depositLimitsStarsMax) {
    throw new Error("STARS_LIMITS_EXCEEDED")
  }
}

export function validateTonAmount(rawAmount: string) {
  const amount = new Prisma.Decimal(rawAmount)
  if (!amount.isFinite() || amount.lte(0)) {
    throw new Error("INVALID_TON_AMOUNT")
  }

  const min = new Prisma.Decimal(paymentsConfig.depositLimitsTonMin)
  const max = new Prisma.Decimal(paymentsConfig.depositLimitsTonMax)

  if (amount.lt(min) || amount.gt(max)) {
    throw new Error("TON_LIMITS_EXCEEDED")
  }

  return amount
}

export async function createStarsDepositIntent(params: {
  userId: string
  amount: number
}) {
  validateStarsAmount(params.amount)

  const expiresAt = new Date(Date.now() + paymentsConfig.depositTtlSeconds * 1000)

  return db.depositIntent.create({
    data: {
      userId: params.userId,
      provider: DepositProvider.TELEGRAM_STARS,
      currency: Currency.STARS,
      status: DepositStatus.WAITING_PAYMENT,
      amount: new Prisma.Decimal(params.amount),
      ledgerReferenceId: buildPendingLedgerReference("stars"),
      expiresAt,
    },
  })
}

export async function createTonDepositIntent(params: {
  userId: string
  amountRaw: string
  senderAddress: string
}) {
  const amount = validateTonAmount(params.amountRaw)
  const amountNano = tonAmountToNano(params.amountRaw)
  const recipientAddress = assertTonDepositAddress()
  const expiresAt = new Date(Date.now() + paymentsConfig.depositTtlSeconds * 1000)
  const created = await db.depositIntent.create({
    data: {
      userId: params.userId,
      provider: DepositProvider.TON_CONNECT,
      currency: Currency.TON,
      status: DepositStatus.CREATED,
      amount,
      amountNano,
      senderAddress: params.senderAddress.trim(),
      recipientAddress,
      ledgerReferenceId: buildPendingLedgerReference("ton"),
      expiresAt,
    },
  })

  const comment = buildTonDepositComment(created.id)
  return db.depositIntent.update({
    where: { id: created.id },
    data: {
      metadata: {
        tonConnectComment: comment,
      },
    },
  })
}

export async function getUserIntent(params: { userId: string; intentId: string }) {
  return db.depositIntent.findFirst({
    where: {
      id: params.intentId,
      userId: params.userId,
    },
  })
}

export async function markIntentExpiredIfNeeded(intentId: string) {
  const now = new Date()
  const intent = await db.depositIntent.findUnique({ where: { id: intentId } })
  if (!intent) return null
  if (isTerminalStatus(intent.status)) return intent
  if (
    intent.provider === DepositProvider.TON_CONNECT &&
    (intent.status === DepositStatus.SUBMITTED || intent.status === DepositStatus.CONFIRMING) &&
    intent.txHash
  ) {
    return intent
  }
  if (intent.expiresAt > now) return intent

  return db.depositIntent.update({
    where: { id: intentId },
    data: {
      status: DepositStatus.EXPIRED,
      failureReason: "Intent expired",
    },
  })
}

export async function listTonIntentsForReconcile(limit: number) {
  const now = new Date()
  return db.depositIntent.findMany({
    where: {
      provider: DepositProvider.TON_CONNECT,
      status: {
        in: [DepositStatus.SUBMITTED, DepositStatus.CONFIRMING],
      },
      OR: [{ expiresAt: { gt: now } }, { status: DepositStatus.CONFIRMING }],
    },
    orderBy: { createdAt: "asc" },
    take: Math.max(1, Math.min(limit, 200)),
  })
}

export async function setIntentStatus(params: {
  intentId: string
  status: DepositStatus
  failureReason?: string | null
}) {
  return db.depositIntent.update({
    where: { id: params.intentId },
    data: {
      status: params.status,
      failureReason: params.failureReason ?? null,
    },
  })
}

export async function setTonIntentSubmission(params: {
  intentId: string
  txHash: string
  txBoc?: string | null
}) {
  return db.depositIntent.update({
    where: { id: params.intentId },
    data: {
      txHash: params.txHash,
      txBoc: params.txBoc ?? null,
      status: DepositStatus.SUBMITTED,
      failureReason: null,
    },
  })
}
