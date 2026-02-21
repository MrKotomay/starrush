import { Prisma, RoundPlayerStatus, RoundStatus, LedgerType, LedgerStatus } from "@prisma/client"
import { db } from "@/lib/db"
import { applyTransaction, createTransaction } from "@/lib/ledger.service"

const BATCH_SIZE = 100
const MAX_BATCHES = 1000

export async function repairLockedBalances() {
  let cursor: string | undefined
  let batches = 0

  while (true) {
    batches += 1
    if (batches > MAX_BATCHES) {
      console.warn("[Reconcile] Max batch limit reached", { batches })
      break
    }

    const wallets = await db.wallet.findMany({
      where: { lockedBalance: { gt: new Prisma.Decimal(0) } },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })

    if (wallets.length === 0) break

    for (const wallet of wallets) {
      await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Wallet" WHERE id = ${wallet.id} FOR UPDATE`

        const active = await tx.roundPlayer.findMany({
          where: {
            userId: wallet.userId,
            status: RoundPlayerStatus.BET_PLACED,
            currency: wallet.currency,
            round: { status: { in: [RoundStatus.WAITING, RoundStatus.RUNNING] } },
          } as any,
        })

        const stale = await tx.roundPlayer.findMany({
          where: {
            userId: wallet.userId,
            status: RoundPlayerStatus.BET_PLACED,
            currency: wallet.currency,
            round: { status: { in: [RoundStatus.CRASHED, RoundStatus.FINISHED] } },
          } as any,
        })

        const expected = active.reduce(
          (sum, player) => sum.plus(player.betAmount),
          new Prisma.Decimal(0)
        )

        if (stale.length > 0) {
          for (const player of stale) {
            const lossEntry = await createTransaction(
              {
                userId: wallet.userId,
                walletId: wallet.id,
                currency: wallet.currency,
                amount: player.betAmount.mul(-1),
                type: "BET_LOSS_SETTLEMENT" as LedgerType,
                status: LedgerStatus.PENDING,
                referenceId: `loss:${player.roundId}:${player.userId}`,
                metadata: {
                  roundId: player.roundId,
                  userId: player.userId,
                  reason: "reconciliation",
                  betAmount: player.betAmount.toString(),
                },
                lockFunds: false,
              },
              tx
            )
            await applyTransaction(lossEntry.id, tx)

            await tx.roundPlayer.update({
              where: { id: player.id },
              data: { status: RoundPlayerStatus.LOST, profit: new Prisma.Decimal(0) },
            })
          }
        }

        const refreshedWallet = await tx.wallet.findUnique({ where: { id: wallet.id } })
        if (!refreshedWallet) return

        if (!refreshedWallet.lockedBalance.equals(expected)) {
          console.info("[Reconcile] Locked balance mismatch", {
            walletId: wallet.id,
            userId: wallet.userId,
            previousLocked: refreshedWallet.lockedBalance.toString(),
            correctedLocked: expected.toString(),
          })

          await tx.wallet.update({
            where: { id: wallet.id },
            data: { lockedBalance: expected },
          })
        }
      })
    }

    cursor = wallets[wallets.length - 1].id
  }

  console.log("[Reconcile] Completed", { batches })
}
