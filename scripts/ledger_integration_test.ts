import { PrismaClient, Prisma, LedgerType, LedgerStatus } from "@prisma/client"
import { createTransaction, applyTransaction } from "../lib/ledger.service"

const db = new PrismaClient()

async function main() {
  const user = await db.user.upsert({
    where: { telegramId: BigInt(9999) },
    create: { telegramId: BigInt(9999), username: "ledger_test" },
    update: {},
  })

  const wallet = await db.wallet.upsert({
    where: { userId_currency: { userId: user.id, currency: "TON" } },
    create: { userId: user.id, currency: "TON" },
    update: {},
  })

  const deposit = await createTransaction({
    userId: user.id,
    currency: "TON",
    amount: new Prisma.Decimal("10"),
    type: LedgerType.DEPOSIT,
    referenceId: `seed-${Date.now()}`,
    status: LedgerStatus.PENDING,
  })

  await applyTransaction(deposit.id)

  const entry = await createTransaction({
    userId: user.id,
    currency: "TON",
    amount: new Prisma.Decimal("-2"),
    type: LedgerType.GAME_BET,
    referenceId: `test-${Date.now()}`,
    status: LedgerStatus.PENDING,
    lockFunds: true,
  })

  await applyTransaction(entry.id)

  const updated = await db.wallet.findUnique({ where: { id: wallet.id } })
  console.log("Wallet balance should be 8:", updated?.balance.toString())
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
