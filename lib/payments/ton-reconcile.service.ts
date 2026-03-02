import { DepositProvider, DepositStatus } from "@prisma/client"
import { db } from "@/lib/db"
import { completeDepositIntent } from "@/lib/payments/deposit-credit.service"
import { buildTonDepositComment, findMatchingTonTransaction } from "@/lib/payments/ton.service"
import { isTerminalStatus } from "@/lib/payments/utils"

export type TonIntentReconcileResult = {
  intentId: string
  status: DepositStatus
  completed: boolean
  reason: string
}

export async function reconcileTonIntent(intentId: string): Promise<TonIntentReconcileResult> {
  const intent = await db.depositIntent.findUnique({ where: { id: intentId } })
  if (!intent) {
    return { intentId, status: DepositStatus.FAILED, completed: false, reason: "INTENT_NOT_FOUND" }
  }

  if (intent.provider !== DepositProvider.TON_CONNECT) {
    return { intentId, status: intent.status, completed: false, reason: "NOT_TON_INTENT" }
  }

  if (intent.status === DepositStatus.COMPLETED) {
    return { intentId, status: intent.status, completed: true, reason: "ALREADY_COMPLETED" }
  }

  if (isTerminalStatus(intent.status)) {
    return { intentId, status: intent.status, completed: false, reason: "TERMINAL_STATUS" }
  }

  const hasSubmittedTransaction = Boolean(intent.txHash)

  if (intent.expiresAt <= new Date() && !hasSubmittedTransaction) {
    const expired = await db.depositIntent.update({
      where: { id: intent.id },
      data: {
        status: DepositStatus.EXPIRED,
        failureReason: "Intent expired",
      },
    })
    return { intentId, status: expired.status, completed: false, reason: "INTENT_EXPIRED" }
  }

  if (!intent.senderAddress || !intent.recipientAddress || intent.amountNano === null) {
    const failed = await db.depositIntent.update({
      where: { id: intent.id },
      data: {
        status: DepositStatus.FAILED,
        failureReason: "Intent is missing TON transfer fields",
      },
    })
    return { intentId, status: failed.status, completed: false, reason: "INTENT_DATA_INVALID" }
  }

  if (!intent.txHash) {
    return { intentId, status: intent.status, completed: false, reason: "TX_HASH_MISSING" }
  }

  const matched = await findMatchingTonTransaction({
    txHash: intent.txHash,
    senderAddress: intent.senderAddress,
    recipientAddress: intent.recipientAddress,
    minAmountNano: BigInt(intent.amountNano.toString()),
    notOlderThanUnix: Math.max(0, Math.floor(intent.createdAt.getTime() / 1000) - 120),
    expectedComment: buildTonDepositComment(intent.id),
  })

  if (!matched) {
    if (intent.status === DepositStatus.CREATED || intent.status === DepositStatus.SUBMITTED) {
      await db.depositIntent.update({
        where: { id: intent.id },
        data: {
          status: DepositStatus.CONFIRMING,
          failureReason: null,
        },
      })
    }

    return { intentId, status: DepositStatus.CONFIRMING, completed: false, reason: "TX_NOT_FOUND_YET" }
  }

  const normalizedHash = matched.txHash.trim().toLowerCase()

  const completed = await completeDepositIntent({
    intentId: intent.id,
    referenceId: `ton:${normalizedHash}`,
    txHash: normalizedHash,
    metadata: {
      lt: matched.lt,
      utime: matched.utime,
      amountNano: matched.amountNano,
    },
  })

  return {
    intentId,
    status: completed.status,
    completed: completed.status === DepositStatus.COMPLETED,
    reason: completed.alreadyCompleted ? "ALREADY_COMPLETED" : "COMPLETED",
  }
}
