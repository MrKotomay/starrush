import { Currency, HouseLedgerType, LedgerType, Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { createAdminAuditLog, findAdminAuditByRequestId } from "@/lib/admin-audit"
import { creditHouse, debitHouse } from "@/lib/house-ledger.service"
import { applyTransaction, createTransaction } from "@/lib/ledger.service"

export class AdminActionError extends Error {
  readonly code: string

  constructor(code: string, message = code) {
    super(message)
    this.name = "AdminActionError"
    this.code = code
  }
}

function parsePositiveDecimal(value: Prisma.Decimal | string | number) {
  const amount = new Prisma.Decimal(value)
  if (!amount.isFinite() || amount.lte(0)) {
    throw new AdminActionError("INVALID_AMOUNT")
  }
  return amount
}

async function getWalletOrThrow(tx: Prisma.TransactionClient, userId: string, currency: Currency) {
  const wallet = await tx.wallet.findUnique({
    where: { userId_currency: { userId, currency } },
  })

  if (!wallet) {
    throw new AdminActionError("WALLET_NOT_FOUND")
  }

  return wallet
}

function mapActionDuplicateError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return new AdminActionError("DUPLICATE_REQUEST")
  }
  return error
}

export async function adjustUserWallet(input: {
  actorUserId: string
  userId: string
  currency: Currency
  direction: "credit" | "debit"
  amount: Prisma.Decimal | string | number
  reason: string
  requestId: string
  ip?: string | null
  userAgent?: string | null
}) {
  const existing = await findAdminAuditByRequestId(input.requestId)
  if (existing) {
    return { idempotent: true as const, auditLog: existing }
  }

  const amount = parsePositiveDecimal(input.amount)

  try {
    return await db.$transaction(async (tx) => {
      const wallet = await getWalletOrThrow(tx, input.userId, input.currency)
      const referenceId = `admin-adjust:${input.requestId}`
      const metadata = {
        source: "admin_panel",
        actorUserId: input.actorUserId,
        direction: input.direction,
        reason: input.reason,
      }

      const entry = await createTransaction(
        {
          userId: input.userId,
          walletId: wallet.id,
          currency: input.currency,
          amount: input.direction === "credit" ? amount : amount.mul(-1),
          type: LedgerType.ADJUSTMENT,
          referenceId,
          metadata,
        },
        tx,
      )
      const appliedEntry = await applyTransaction(entry.id, tx)

      const houseResult =
        input.direction === "credit"
          ? await debitHouse(
              {
                currency: input.currency,
                amount,
                type: HouseLedgerType.ADJUSTMENT,
                userId: input.userId,
                metadata: {
                  ...metadata,
                  mirroredLedgerId: appliedEntry.id,
                },
              },
              tx,
            )
          : await creditHouse(
              {
                currency: input.currency,
                amount,
                type: HouseLedgerType.ADJUSTMENT,
                userId: input.userId,
                metadata: {
                  ...metadata,
                  mirroredLedgerId: appliedEntry.id,
                },
              },
              tx,
            )

      const updatedWallet = await tx.wallet.findUnique({
        where: { id: wallet.id },
      })
      if (!updatedWallet) {
        throw new AdminActionError("WALLET_NOT_FOUND")
      }

      const auditLog = await createAdminAuditLog(
        {
          actorUserId: input.actorUserId,
          action: input.direction === "credit" ? "USER_WALLET_CREDIT" : "USER_WALLET_DEBIT",
          targetType: "User",
          targetId: input.userId,
          requestId: input.requestId,
          ip: input.ip,
          userAgent: input.userAgent,
          metadata: {
            currency: input.currency,
            amount: amount.toString(),
            reason: input.reason,
            ledgerId: appliedEntry.id,
            houseLedgerId: houseResult.ledgerEntry.id,
          },
        },
        tx,
      )

      return {
        idempotent: false as const,
        auditLog,
        ledgerEntry: appliedEntry,
        houseLedgerEntry: houseResult.ledgerEntry,
        wallet: updatedWallet,
      }
    })
  } catch (error) {
    const mappedError = mapActionDuplicateError(error)
    if (mappedError instanceof Error) {
      throw mappedError
    }
    throw error
  }
}

export async function adjustHouseWallet(input: {
  actorUserId: string
  currency: Currency
  direction: "credit" | "debit"
  amount: Prisma.Decimal | string | number
  reason: string
  requestId: string
  ip?: string | null
  userAgent?: string | null
}) {
  const existing = await findAdminAuditByRequestId(input.requestId)
  if (existing) {
    return { idempotent: true as const, auditLog: existing }
  }

  const amount = parsePositiveDecimal(input.amount)

  try {
    return await db.$transaction(async (tx) => {
      const result =
        input.direction === "credit"
          ? await creditHouse(
              {
                currency: input.currency,
                amount,
                type: HouseLedgerType.ADJUSTMENT,
                metadata: {
                  source: "admin_panel",
                  actorUserId: input.actorUserId,
                  reason: input.reason,
                  direction: input.direction,
                },
              },
              tx,
            )
          : await debitHouse(
              {
                currency: input.currency,
                amount,
                type: HouseLedgerType.ADJUSTMENT,
                metadata: {
                  source: "admin_panel",
                  actorUserId: input.actorUserId,
                  reason: input.reason,
                  direction: input.direction,
                },
              },
              tx,
            )

      const auditLog = await createAdminAuditLog(
        {
          actorUserId: input.actorUserId,
          action: input.direction === "credit" ? "HOUSE_WALLET_CREDIT" : "HOUSE_WALLET_DEBIT",
          targetType: "HouseWallet",
          targetId: result.wallet.id,
          requestId: input.requestId,
          ip: input.ip,
          userAgent: input.userAgent,
          metadata: {
            currency: input.currency,
            amount: amount.toString(),
            reason: input.reason,
            houseLedgerId: result.ledgerEntry.id,
          },
        },
        tx,
      )

      return {
        idempotent: false as const,
        auditLog,
        houseLedgerEntry: result.ledgerEntry,
        wallet: result.wallet,
      }
    })
  } catch (error) {
    const mappedError = mapActionDuplicateError(error)
    if (mappedError instanceof Error) {
      throw mappedError
    }
    throw error
  }
}
