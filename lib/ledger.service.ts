import { Prisma, LedgerStatus, LedgerType, Currency } from "@prisma/client"
import { db } from "@/lib/db"

type CreateTransactionInput = {
  userId: string
  walletId?: string
  currency: Currency
  amount: Prisma.Decimal
  type: LedgerType
  referenceId: string
  metadata?: Prisma.InputJsonValue
  status?: LedgerStatus
  lockFunds?: boolean
}

export async function createTransaction(
  input: CreateTransactionInput,
  tx?: Prisma.TransactionClient
) {
  const status = input.status ?? LedgerStatus.PENDING
  const amount = new Prisma.Decimal(input.amount)
  const lockFunds =
    input.lockFunds ?? (status === LedgerStatus.PENDING && amount.isNegative())

  const client = tx ?? db

  const wallet = input.walletId
    ? await client.wallet.findUnique({ where: { id: input.walletId } })
    : await client.wallet.findUnique({ where: { userId_currency: { userId: input.userId, currency: input.currency } } })

  if (!wallet) throw new Error("WALLET_NOT_FOUND")

  const run = async (clientTx: Prisma.TransactionClient | typeof db) => {
    if (lockFunds && amount.isNegative()) {
      if ("$queryRaw" in clientTx) {
        await lockWalletRow(clientTx as Prisma.TransactionClient, wallet.id)
      }
      const freshWallet = await clientTx.wallet.findUnique({ where: { id: wallet.id } })
      if (!freshWallet) throw new Error("WALLET_NOT_FOUND")

      const available = freshWallet.balance.minus(freshWallet.lockedBalance)
      if (available.lessThan(amount.abs())) throw new Error("INSUFFICIENT_FUNDS")

      await clientTx.wallet.update({
        where: { id: wallet.id },
        data: { lockedBalance: freshWallet.lockedBalance.plus(amount.abs()) },
      })
    }

    try {
      return await clientTx.ledgerEntry.create({
        data: {
          userId: input.userId,
          walletId: wallet.id,
          currency: input.currency,
          amount,
          type: input.type,
          status,
          referenceId: input.referenceId,
          metadata: input.metadata,
        },
      })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const existing = await clientTx.ledgerEntry.findUnique({
          where: {
            walletId_referenceId_type: {
              walletId: wallet.id,
              referenceId: input.referenceId,
              type: input.type,
            },
          },
        })
        if (existing) return existing
      }
      throw e
    }
  }

  if (tx) {
    return run(tx)
  }

  return db.$transaction(async (innerTx) => run(innerTx))
}

export async function applyTransaction(ledgerId: string, tx?: Prisma.TransactionClient) {
  const run = async (txClient: Prisma.TransactionClient) => {
    const entry = await txClient.ledgerEntry.findUnique({ where: { id: ledgerId } })
    if (!entry) throw new Error("LEDGER_NOT_FOUND")
    if (entry.status === LedgerStatus.COMPLETED) return entry
    if (entry.status === LedgerStatus.FAILED) throw new Error("LEDGER_FAILED")

    await lockWalletRow(txClient, entry.walletId)
    const wallet = await txClient.wallet.findUnique({ where: { id: entry.walletId } })
    if (!wallet) throw new Error("WALLET_NOT_FOUND")

    const amount = new Prisma.Decimal(entry.amount)
    let nextBalance = wallet.balance
    let nextLocked = wallet.lockedBalance

    if (amount.isNegative()) {
      const abs = amount.abs()
      if (wallet.lockedBalance.lessThan(abs)) throw new Error("LOCKED_FUNDS_MISMATCH")
      nextBalance = wallet.balance.minus(abs)
      nextLocked = wallet.lockedBalance.minus(abs)
    } else {
      nextBalance = wallet.balance.plus(amount)
    }

    await txClient.wallet.update({
      where: { id: wallet.id },
      data: { balance: nextBalance, lockedBalance: nextLocked },
    })

    return txClient.ledgerEntry.update({
      where: { id: ledgerId },
      data: { status: LedgerStatus.COMPLETED },
    })
  }

  if (tx) {
    return run(tx)
  }

  return db.$transaction(async (innerTx) => {
    return run(innerTx)
  })
}

export async function rollbackTransaction(ledgerId: string) {
  return db.$transaction(async (tx) => {
    const entry = await tx.ledgerEntry.findUnique({ where: { id: ledgerId } })
    if (!entry) throw new Error("LEDGER_NOT_FOUND")

    await lockWalletRow(tx, entry.walletId)
    const wallet = await tx.wallet.findUnique({ where: { id: entry.walletId } })
    if (!wallet) throw new Error("WALLET_NOT_FOUND")

    const amount = new Prisma.Decimal(entry.amount)

    if (entry.status === LedgerStatus.PENDING) {
      if (amount.isNegative()) {
        const abs = amount.abs()
        await tx.wallet.update({
          where: { id: wallet.id },
          data: { lockedBalance: wallet.lockedBalance.minus(abs) },
        })
      }

      return tx.ledgerEntry.update({
        where: { id: ledgerId },
        data: { status: LedgerStatus.FAILED },
      })
    }

    if (entry.status === LedgerStatus.COMPLETED) {
      const referenceId = `${entry.referenceId}:rollback`
      const reversal = await tx.ledgerEntry.create({
        data: {
          userId: entry.userId,
          walletId: entry.walletId,
          currency: entry.currency,
          amount: amount.mul(-1),
          type: LedgerType.ADJUSTMENT,
          status: LedgerStatus.COMPLETED,
          referenceId,
          metadata: { rollbackOf: entry.id },
        },
      })

      const nextBalance = wallet.balance.plus(amount.mul(-1))
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: nextBalance },
      })

      return reversal
    }

    return entry
  })
}

export async function transferBetweenWallets(params: {
  fromWalletId: string
  toWalletId: string
  amount: Prisma.Decimal
  referenceId: string
  metadata?: Prisma.InputJsonValue
}) {
  return db.$transaction(async (tx) => {
    await lockWalletRow(tx, params.fromWalletId)
    await lockWalletRow(tx, params.toWalletId)

    const from = await tx.wallet.findUnique({ where: { id: params.fromWalletId } })
    const to = await tx.wallet.findUnique({ where: { id: params.toWalletId } })

    if (!from || !to) throw new Error("WALLET_NOT_FOUND")
    if (from.currency !== to.currency) throw new Error("CURRENCY_MISMATCH")

    const amount = new Prisma.Decimal(params.amount)
    if (from.balance.minus(from.lockedBalance).lessThan(amount)) throw new Error("INSUFFICIENT_FUNDS")

    const debit = await tx.ledgerEntry.create({
      data: {
        userId: from.userId,
        walletId: from.id,
        currency: from.currency,
        amount: amount.mul(-1),
        type: LedgerType.TRANSFER,
        status: LedgerStatus.COMPLETED,
        referenceId: `${params.referenceId}:debit`,
        metadata: params.metadata,
      },
    })

    const credit = await tx.ledgerEntry.create({
      data: {
        userId: to.userId,
        walletId: to.id,
        currency: to.currency,
        amount,
        type: LedgerType.TRANSFER,
        status: LedgerStatus.COMPLETED,
        referenceId: `${params.referenceId}:credit`,
        metadata: params.metadata,
      },
    })

    await tx.wallet.update({
      where: { id: from.id },
      data: { balance: from.balance.minus(amount) },
    })

    await tx.wallet.update({
      where: { id: to.id },
      data: { balance: to.balance.plus(amount) },
    })

    return { debit, credit }
  })
}

export async function releaseLockedFunds(params: {
  walletId: string
  amount: Prisma.Decimal
  reason: string
  tx?: Prisma.TransactionClient
}) {
  const amount = new Prisma.Decimal(params.amount)
  if (amount.lte(0)) throw new Error("INVALID_RELEASE_AMOUNT")

  const run = async (clientTx: Prisma.TransactionClient | typeof db) => {
    if ("$queryRaw" in clientTx) {
      await lockWalletRow(clientTx as Prisma.TransactionClient, params.walletId)
    }

    const wallet = await clientTx.wallet.findUnique({ where: { id: params.walletId } })
    if (!wallet) throw new Error("WALLET_NOT_FOUND")

    const nextLocked = wallet.lockedBalance.minus(amount)
    const safeLocked = nextLocked.lt(0) ? new Prisma.Decimal(0) : nextLocked

    await clientTx.wallet.update({
      where: { id: wallet.id },
      data: { lockedBalance: safeLocked },
    })

    return { previousLocked: wallet.lockedBalance, nextLocked: safeLocked, reason: params.reason }
  }

  if (params.tx) {
    return run(params.tx)
  }

  return db.$transaction(async (tx) => run(tx))
}

async function lockWalletRow(tx: Prisma.TransactionClient, walletId: string) {
  await tx.$queryRaw`SELECT id FROM "Wallet" WHERE id = ${walletId} FOR UPDATE`
}
