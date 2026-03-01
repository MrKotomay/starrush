import { Currency, LedgerStatus, LedgerType, Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { applyTransaction, createTransaction } from "@/lib/ledger.service"

const REFERRAL_START_PREFIX = "ref_"
const REFERRAL_REFERENCE_PREFIX = "referral:deposit:"
const FALLBACK_BOT_USERNAME = "starrush_bot"
const MAX_START_PARAM_LENGTH = 64

function normalizeBotUsername(raw: string | undefined): string {
  const candidate = (raw ?? FALLBACK_BOT_USERNAME).trim().replace(/^@+/, "")
  return candidate || FALLBACK_BOT_USERNAME
}

function parseRate(raw: string | undefined): Prisma.Decimal {
  if (!raw) return new Prisma.Decimal("0.10")
  try {
    const rate = new Prisma.Decimal(raw)
    if (rate.lte(0)) return new Prisma.Decimal(0)
    if (rate.gte(1)) return new Prisma.Decimal(1)
    return rate
  } catch {
    return new Prisma.Decimal("0.10")
  }
}

export function getReferralDepositRate() {
  return parseRate(process.env.REFERRAL_DEPOSIT_RATE)
}

export function buildReferralStartParam(referrerUserId: string): string {
  return `${REFERRAL_START_PREFIX}${referrerUserId}`
}

export function parseReferralStartParam(startParam: string | null | undefined): string | null {
  if (!startParam) return null
  const normalized = startParam.trim()
  if (!normalized.startsWith(REFERRAL_START_PREFIX)) return null
  if (normalized.length > MAX_START_PARAM_LENGTH) return null
  const rawId = normalized.slice(REFERRAL_START_PREFIX.length)
  if (!rawId) return null
  if (!/^[a-zA-Z0-9]+$/.test(rawId)) return null
  return rawId
}

export function buildReferralLink(referrerUserId: string): string {
  const botUsername = normalizeBotUsername(process.env.TELEGRAM_BOT_USERNAME)
  const startParam = buildReferralStartParam(referrerUserId)
  return `https://t.me/${botUsername}?startapp=${encodeURIComponent(startParam)}`
}

export function isReferralRewardReference(referenceId: string): boolean {
  return referenceId.startsWith(REFERRAL_REFERENCE_PREFIX)
}

type ApplyReferralRewardResult =
  | { status: "skipped"; reason: string }
  | { status: "applied"; rewardLedgerId: string; amount: string; currency: Currency }

export async function applyReferralRewardForDeposit(
  depositLedgerId: string
): Promise<ApplyReferralRewardResult> {
  const deposit = await db.ledgerEntry.findUnique({
    where: { id: depositLedgerId },
    select: {
      id: true,
      userId: true,
      currency: true,
      amount: true,
      type: true,
      status: true,
      user: {
        select: {
          referredById: true,
        },
      },
    },
  })

  if (!deposit) return { status: "skipped", reason: "DEPOSIT_NOT_FOUND" }
  if (deposit.type !== LedgerType.DEPOSIT) return { status: "skipped", reason: "NOT_DEPOSIT" }
  if (deposit.status !== LedgerStatus.COMPLETED) return { status: "skipped", reason: "DEPOSIT_NOT_COMPLETED" }

  const depositAmount = new Prisma.Decimal(deposit.amount)
  if (depositAmount.lte(0)) return { status: "skipped", reason: "NON_POSITIVE_DEPOSIT" }

  const referrerUserId = deposit.user.referredById
  if (!referrerUserId) return { status: "skipped", reason: "NO_REFERRER" }
  if (referrerUserId === deposit.userId) return { status: "skipped", reason: "SELF_REFERRAL_BLOCKED" }

  const rate = getReferralDepositRate()
  if (rate.lte(0)) return { status: "skipped", reason: "ZERO_RATE" }

  const rewardAmount = depositAmount.mul(rate).toDecimalPlaces(9, Prisma.Decimal.ROUND_DOWN)
  if (rewardAmount.lte(0)) return { status: "skipped", reason: "ROUND_TO_ZERO" }

  await db.wallet.upsert({
    where: {
      userId_currency: {
        userId: referrerUserId,
        currency: deposit.currency,
      },
    },
    create: {
      userId: referrerUserId,
      currency: deposit.currency,
    },
    update: {},
  })

  const rewardReferenceId = `${REFERRAL_REFERENCE_PREFIX}${deposit.id}`

  const rewardEntry = await createTransaction({
    userId: referrerUserId,
    currency: deposit.currency,
    amount: rewardAmount,
    type: LedgerType.REWARD,
    referenceId: rewardReferenceId,
    metadata: {
      source: "referral",
      rate: rate.toString(),
      fromUserId: deposit.userId,
      sourceLedgerId: deposit.id,
      sourceAmount: depositAmount.toString(),
    },
  })

  const applied = await applyTransaction(rewardEntry.id)
  return {
    status: "applied",
    rewardLedgerId: applied.id,
    amount: applied.amount.toString(),
    currency: applied.currency,
  }
}
