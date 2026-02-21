import { Prisma } from "@prisma/client"
import { db } from "../lib/db"
import { redis } from "../lib/redis"
import {
  CASHOUT_MONEY_SCALE,
  CASHOUT_MULTIPLIER_SCALE,
  computeCashoutAmounts,
} from "../services/game-settlement.service"

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message)
}

function expectDecimal(actual: Prisma.Decimal, expected: Prisma.Decimal, message: string) {
  if (!actual.equals(expected)) {
    throw new Error(`${message}. expected=${expected.toString()} actual=${actual.toString()}`)
  }
}

async function main() {
  const stake = new Prisma.Decimal("1.234567891")
  const rawMultiplier = 2.34567
  const settled = computeCashoutAmounts(stake, rawMultiplier)

  expect(
    settled.multiplier.toFixed(CASHOUT_MULTIPLIER_SCALE) === "2.3457",
    "multiplier must be normalized to 4 decimals"
  )

  const expectedPayout = stake
    .mul(new Prisma.Decimal("2.3457"))
    .toDecimalPlaces(CASHOUT_MONEY_SCALE, Prisma.Decimal.ROUND_HALF_UP)
  const expectedProfit = expectedPayout
    .minus(stake)
    .toDecimalPlaces(CASHOUT_MONEY_SCALE, Prisma.Decimal.ROUND_HALF_UP)

  expectDecimal(settled.payout, expectedPayout, "payout = stake * normalizedMultiplier")
  expectDecimal(settled.profit, expectedProfit, "profit = payout - stake")

  const nearOne = computeCashoutAmounts("5", 1.00004)
  expect(nearOne.multiplier.toFixed(CASHOUT_MULTIPLIER_SCALE) === "1.0000", "near-one multiplier rounding")
  expectDecimal(nearOne.profit, new Prisma.Decimal("0"), "profit must be zero at 1.0000x")

  console.log("[PASS] cashout math unit test")
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
    if (redis) await redis.quit()
  })
