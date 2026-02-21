import { Prisma, Currency, HouseLedgerType, RoundStatus, LedgerType, LedgerStatus } from "@prisma/client"
import { db } from "../lib/db"
import { redis } from "../lib/redis"
import { creditHouse, getOrCreateHouseWallet } from "../lib/house-ledger.service"
import { REDIS_KEYS } from "../services/game-round.service"
import { createTransaction, applyTransaction } from "../lib/ledger.service"
import { placeBet, DuplicateBetError, InsufficientBalanceError, RoundNotAcceptingBetsError } from "../services/game-betting.service"

async function ensureHouseBankroll(currency: Currency, minimumBalance: Prisma.Decimal) {
  const wallet = await getOrCreateHouseWallet(currency)
  if (wallet.balance.gte(minimumBalance)) return

  await creditHouse({
    currency,
    amount: minimumBalance.minus(wallet.balance),
    type: HouseLedgerType.INITIAL_BANKROLL,
    metadata: { source: "betting_integration_test" },
  })
}

async function main() {
  await ensureHouseBankroll(Currency.TON, new Prisma.Decimal("1000000"))

  const user = await db.user.upsert({
    where: { telegramId: BigInt(7777) },
    create: { telegramId: BigInt(7777), username: "bet_test" },
    update: {},
  })

  const wallet = await db.wallet.upsert({
    where: { userId_currency: { userId: user.id, currency: "TON" } },
    create: { userId: user.id, currency: "TON" },
    update: {},
  })

  const deposit = await createTransaction({
    userId: user.id,
    walletId: wallet.id,
    currency: "TON",
    amount: new Prisma.Decimal("10"),
    type: LedgerType.DEPOSIT,
    status: LedgerStatus.PENDING,
    referenceId: `seed-${Date.now()}`,
  })

  await applyTransaction(deposit.id)

  const round = await db.round.create({
    data: {
      status: RoundStatus.WAITING,
      serverSeedHash: "seedhash",
      serverSeed: "seed",
    },
  })

  if (!redis) throw new Error("REDIS_NOT_CONFIGURED")
  await redis.set(REDIS_KEYS.currentRound, round.id)
  await redis.set(REDIS_KEYS.roundState(round.id), RoundStatus.WAITING)

  const bet = await placeBet(user.id, 2, Currency.TON)
  console.log("bet ok", bet)

  try {
    await placeBet(user.id, 2, Currency.TON)
  } catch (e) {
    if (e instanceof DuplicateBetError) console.log("duplicate bet blocked")
  }

  try {
    await placeBet(user.id, 1000, Currency.TON)
  } catch (e) {
    if (e instanceof InsufficientBalanceError) console.log("insufficient balance blocked")
  }

  await db.round.update({ where: { id: round.id }, data: { status: RoundStatus.RUNNING } })
  await redis.set(REDIS_KEYS.roundState(round.id), RoundStatus.RUNNING)

  try {
    await placeBet(user.id, 1, Currency.TON)
  } catch (e) {
    if (e instanceof RoundNotAcceptingBetsError) console.log("round not accepting bets blocked")
  }

  const round2 = await db.round.create({
    data: {
      status: RoundStatus.WAITING,
      serverSeedHash: "seedhash2",
      serverSeed: "seed2",
    },
  })

  await redis.set(REDIS_KEYS.currentRound, round2.id)
  await redis.set(REDIS_KEYS.roundState(round2.id), RoundStatus.WAITING)

  const results = await Promise.allSettled([
    placeBet(user.id, 1, Currency.TON),
    placeBet(user.id, 1, Currency.TON),
  ])

  const successCount = results.filter((r) => r.status === "fulfilled").length
  const dupCount = results.filter((r) => r.status === "rejected").length
  console.log("concurrent bets", { successCount, dupCount })

  await db.$disconnect()
  if (redis) await redis.quit()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
