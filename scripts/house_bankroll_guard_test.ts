import { Currency, HouseLedgerType, Prisma } from "@prisma/client"
import { db } from "../lib/db"
import { debitHouse, getOrCreateHouseWallet, HouseInsufficientBankrollError } from "../lib/house-ledger.service"

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message)
}

async function main() {
  await getOrCreateHouseWallet(Currency.TON)
  await db.houseWallet.update({
    where: { currency: Currency.TON },
    data: { balance: new Prisma.Decimal("1") },
  })

  let threwExpected = false
  try {
    await debitHouse({
      currency: Currency.TON,
      amount: new Prisma.Decimal("2"),
      type: HouseLedgerType.BET_WIN,
      metadata: { source: "house_bankroll_guard_test" },
    })
  } catch (error) {
    if (error instanceof HouseInsufficientBankrollError) {
      threwExpected = true
    } else {
      throw error
    }
  }

  expect(threwExpected, "debitHouse must throw HouseInsufficientBankrollError on underflow")

  const walletAfter = await db.houseWallet.findUnique({ where: { currency: Currency.TON } })
  if (!walletAfter) throw new Error("house wallet missing")
  expect(walletAfter.balance.equals(new Prisma.Decimal("1")), "house balance must remain unchanged after rejected debit")

  console.log("[PASS] house bankroll guard test")
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
