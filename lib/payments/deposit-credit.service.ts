import { DepositStatus, LedgerType, Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { applyTransaction, createTransaction } from "@/lib/ledger.service"
import { buildSafeLedgerReferenceId, isTerminalStatus } from "@/lib/payments/utils"
import { applyReferralRewardForDeposit } from "@/lib/referrals"

type CompleteDepositIntentInput = {
  intentId: string
  referenceId: string
  providerPaymentId?: string | null
  providerExternalId?: string | null
  providerPayload?: string | null
  txHash?: string | null
  metadata?: Prisma.InputJsonValue
}

type CompleteDepositIntentResult = {
  alreadyCompleted: boolean
  intentId: string
  status: DepositStatus
  ledgerId: string
}

export async function completeDepositIntent(
  input: CompleteDepositIntentInput
): Promise<CompleteDepositIntentResult> {
  const safeReferenceId = buildSafeLedgerReferenceId(input.referenceId)

  const result = await db.$transaction(async (tx) => {
    const intent = await tx.depositIntent.findUnique({ where: { id: input.intentId } })
    if (!intent) {
      throw new Error("INTENT_NOT_FOUND")
    }

    if (intent.status === DepositStatus.COMPLETED) {
      const existingLedger = await tx.ledgerEntry.findFirst({
        where: {
          userId: intent.userId,
          type: LedgerType.DEPOSIT,
          referenceId: intent.ledgerReferenceId,
        },
        orderBy: { createdAt: "desc" },
      })

      if (!existingLedger) {
        throw new Error("COMPLETED_INTENT_WITHOUT_LEDGER")
      }

      return {
        alreadyCompleted: true,
        intentId: intent.id,
        status: intent.status,
        ledgerId: existingLedger.id,
      }
    }

    if (isTerminalStatus(intent.status)) {
      throw new Error("INTENT_NOT_PAYABLE")
    }

    if (intent.expiresAt <= new Date()) {
      await tx.depositIntent.update({
        where: { id: intent.id },
        data: {
          status: DepositStatus.EXPIRED,
          failureReason: "Intent expired",
        },
      })
      throw new Error("INTENT_EXPIRED")
    }

    const entry = await createTransaction(
      {
        userId: intent.userId,
        currency: intent.currency,
        amount: new Prisma.Decimal(intent.amount),
        type: LedgerType.DEPOSIT,
        referenceId: safeReferenceId,
        metadata: {
          source: "payments",
          provider: intent.provider,
          intentId: intent.id,
          requestedReferenceId: input.referenceId,
          txHash: input.txHash ?? null,
          providerPaymentId: input.providerPaymentId ?? null,
          providerExternalId: input.providerExternalId ?? null,
          payload: input.providerPayload ?? null,
          extra: input.metadata ?? null,
        },
      },
      tx
    )

    const applied = await applyTransaction(entry.id, tx)

    const updatedIntent = await tx.depositIntent.update({
      where: { id: intent.id },
      data: {
        status: DepositStatus.COMPLETED,
        failureReason: null,
        ledgerReferenceId: safeReferenceId,
        providerPaymentId: input.providerPaymentId ?? intent.providerPaymentId,
        providerExternalId: input.providerExternalId ?? intent.providerExternalId,
        providerPayload: input.providerPayload ?? intent.providerPayload,
        txHash: input.txHash ?? intent.txHash,
        metadata: {
          ...(intent.metadata && typeof intent.metadata === "object" ? (intent.metadata as Record<string, unknown>) : {}),
          creditedAt: new Date().toISOString(),
        },
      },
    })

    return {
      alreadyCompleted: false,
      intentId: updatedIntent.id,
      status: updatedIntent.status,
      ledgerId: applied.id,
    }
  })

  try {
    await applyReferralRewardForDeposit(result.ledgerId)
  } catch (error) {
    console.error("[Payments] Referral reward apply failed", {
      intentId: result.intentId,
      ledgerId: result.ledgerId,
      error,
    })
  }

  return result
}
