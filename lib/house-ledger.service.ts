import { Currency, HouseLedgerType, Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { getInitialHouseBankroll } from "@/lib/game-config"

export class HouseInsufficientBankrollError extends Error {
  readonly code = "HOUSE_INSUFFICIENT_BANKROLL"
  readonly details: Record<string, string>

  constructor(details: Record<string, string>) {
    super("House bankroll is insufficient for this operation")
    this.name = "HouseInsufficientBankrollError"
    this.details = details
  }
}

type HouseLedgerInput = {
  currency: Currency
  amount: Prisma.Decimal | number | string
  type: HouseLedgerType
  roundId?: string | null
  userId?: string | null
  metadata?: Prisma.InputJsonValue
}

const IDEMPOTENT_HOUSE_LEDGER_TYPES = new Set<HouseLedgerType>([
  HouseLedgerType.BET_LOSS_SETTLEMENT,
  HouseLedgerType.BET_WIN,
])

function asPositiveDecimal(value: Prisma.Decimal | number | string) {
  const amount = new Prisma.Decimal(value)
  if (amount.lte(0)) throw new Error("HOUSE_INVALID_AMOUNT")
  return amount
}

async function lockHouseWalletRow(tx: Prisma.TransactionClient, currency: Currency) {
  await tx.$queryRaw`SELECT id FROM "HouseWallet" WHERE "currency" = ${currency}::"Currency" FOR UPDATE`
}

export async function getOrCreateHouseWallet(
  currency: Currency,
  initialBalanceFromEnv?: Prisma.Decimal | number | string,
  tx?: Prisma.TransactionClient
) {
  const client = tx ?? db
  const initialBalance = new Prisma.Decimal(
    initialBalanceFromEnv ?? getInitialHouseBankroll(currency)
  )

  return client.houseWallet.upsert({
    where: { currency },
    update: {},
    create: {
      currency,
      balance: initialBalance,
    },
  })
}

async function mutateHouseBalance(
  direction: "credit" | "debit",
  input: HouseLedgerInput,
  tx?: Prisma.TransactionClient
) {
  const amount = asPositiveDecimal(input.amount)

  const run = async (txClient: Prisma.TransactionClient) => {
    await getOrCreateHouseWallet(input.currency, undefined, txClient)
    await lockHouseWalletRow(txClient, input.currency)

    const wallet = await txClient.houseWallet.findUnique({
      where: { currency: input.currency },
    })

    if (!wallet) throw new Error("HOUSE_WALLET_NOT_FOUND")

    const existingEntry =
      input.roundId &&
      input.userId &&
      IDEMPOTENT_HOUSE_LEDGER_TYPES.has(input.type)
        ? await txClient.houseLedgerEntry.findFirst({
            where: {
              houseWalletId: wallet.id,
              roundId: input.roundId,
              userId: input.userId,
              type: input.type,
            },
          })
        : null

    if (existingEntry) {
      return { wallet, ledgerEntry: existingEntry }
    }

    const signedAmount = direction === "credit" ? amount : amount.mul(-1)
    const nextBalance = wallet.balance.plus(signedAmount)

    if (direction === "debit" && nextBalance.lt(0)) {
      throw new HouseInsufficientBankrollError({
        currency: input.currency,
        currentBalance: wallet.balance.toString(),
        debitAmount: amount.toString(),
      })
    }

    const updatedWallet = await txClient.houseWallet.update({
      where: { id: wallet.id },
      data: { balance: nextBalance },
    })

    const ledgerEntry = await txClient.houseLedgerEntry.create({
      data: {
        houseWalletId: wallet.id,
        currency: input.currency,
        amount: signedAmount,
        type: input.type,
        roundId: input.roundId ?? null,
        userId: input.userId ?? null,
        metadata: input.metadata,
      },
    })

    return { wallet: updatedWallet, ledgerEntry }
  }

  if (tx) {
    return run(tx)
  }

  return db.$transaction(async (innerTx) => run(innerTx))
}

export async function creditHouse(input: HouseLedgerInput, tx?: Prisma.TransactionClient) {
  return mutateHouseBalance("credit", input, tx)
}

export async function debitHouse(input: HouseLedgerInput, tx?: Prisma.TransactionClient) {
  return mutateHouseBalance("debit", input, tx)
}
