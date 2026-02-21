import {
  Prisma,
  Currency,
  HouseLedgerType,
  RoundStatus,
  LedgerType,
  LedgerStatus,
} from "@prisma/client"
import { db } from "../lib/db"
import { redis } from "../lib/redis"
import { creditHouse, getOrCreateHouseWallet } from "../lib/house-ledger.service"
import { REDIS_KEYS } from "../services/game-round.service"
import { createTransaction, applyTransaction } from "../lib/ledger.service"
import { placeBet } from "../services/game-betting.service"
import { cashoutPlayer, PlayerAlreadyCashedOutError } from "../services/game-settlement.service"

async function ensureHouseBankroll(currency: Currency, minimumBalance: Prisma.Decimal) {
  const wallet = await getOrCreateHouseWallet(currency)
  if (wallet.balance.gte(minimumBalance)) return

  await creditHouse({
    currency,
    amount: minimumBalance.minus(wallet.balance),
    type: HouseLedgerType.INITIAL_BANKROLL,
    metadata: { source: "cashout_integration_test" },
  })
}

async function main() {
  await ensureHouseBankroll(Currency.TON, new Prisma.Decimal("1000000"))

  const user = await db.user.upsert({
    where: { telegramId: BigInt(9991) },
    create: { telegramId: BigInt(9991), username: "cashout_test" },
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
    amount: new Prisma.Decimal("5"),
    type: LedgerType.DEPOSIT,
    status: LedgerStatus.PENDING,
    referenceId: `seed-${Date.now()}`,
  })
  await applyTransaction(deposit.id)

  const round = await db.round.create({
    data: {
      status: RoundStatus.WAITING,
      serverSeedHash: "seedhash-cashout",
      serverSeed: "seed",
    },
  })

  if (!redis) throw new Error("REDIS_NOT_CONFIGURED")
  await redis.set(REDIS_KEYS.currentRound, round.id)
  await redis.set(REDIS_KEYS.roundState(round.id), RoundStatus.WAITING)

  await placeBet(user.id, 2, Currency.TON)

  const started = await db.round.update({
    where: { id: round.id },
    data: { status: RoundStatus.RUNNING, startedAt: new Date(Date.now() - 1000) },
  })

  await redis.set(REDIS_KEYS.roundState(started.id), RoundStatus.RUNNING)
  await redis.set(REDIS_KEYS.multiplier(started.id), "2.00")

  const cashout = await cashoutPlayer(started.id, user.id)
  console.log("cashout ok", cashout)

  try {
    await cashoutPlayer(started.id, user.id)
  } catch (e) {
    if (e instanceof PlayerAlreadyCashedOutError) console.log("double cashout blocked")
  }

  await db.$disconnect()
  if (redis) await redis.quit()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
