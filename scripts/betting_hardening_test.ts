import {
  Prisma,
  Currency,
  HouseLedgerType,
  RoundStatus,
  RoundPlayerStatus,
  LedgerType,
  LedgerStatus,
} from "@prisma/client"
import { db } from "../lib/db"
import { redis } from "../lib/redis"
import { creditHouse, getOrCreateHouseWallet } from "../lib/house-ledger.service"
import { REDIS_KEYS } from "../services/game-round.service"
import { createTransaction, applyTransaction } from "../lib/ledger.service"
import {
  placeBet,
  BettingClosedError,
  RiskLimitExceededError,
  RoundNotAcceptingBetsError,
} from "../services/game-betting.service"
import { repairLockedBalances } from "../services/reconciliation.service"

async function ensureHouseBankroll(currency: Currency, minimumBalance: Prisma.Decimal) {
  const wallet = await getOrCreateHouseWallet(currency)
  if (wallet.balance.gte(minimumBalance)) return

  await creditHouse({
    currency,
    amount: minimumBalance.minus(wallet.balance),
    type: HouseLedgerType.INITIAL_BANKROLL,
    metadata: { source: "betting_hardening_test" },
  })
}

async function main() {
  await ensureHouseBankroll(Currency.TON, new Prisma.Decimal("1000000"))

  const user = await db.user.upsert({
    where: { telegramId: BigInt(8888) },
    create: { telegramId: BigInt(8888), username: "hardening_test" },
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
      serverSeedHash: "seedhash3",
      serverSeed: "seed3",
      createdAt: new Date(Date.now() - 4900),
    },
  })

  if (!redis) throw new Error("REDIS_NOT_CONFIGURED")
  await redis.set(REDIS_KEYS.currentRound, round.id)
  await redis.set(REDIS_KEYS.roundState(round.id), RoundStatus.WAITING)

  try {
    await placeBet(user.id, 1, Currency.TON)
  } catch (e) {
    if (e instanceof BettingClosedError) {
      console.log("safety window rejection ok")
    }
  }

  await db.round.update({ where: { id: round.id }, data: { status: RoundStatus.RUNNING } })

  try {
    await placeBet(user.id, 1, Currency.TON)
  } catch (e) {
    if (e instanceof RoundNotAcceptingBetsError) {
      console.log("round status revalidation ok")
    }
  }

  const round2 = await db.round.create({
    data: {
      status: RoundStatus.FINISHED,
      serverSeedHash: "seedhash4",
      serverSeed: "seed4",
    },
  })

  await db.roundPlayer.create({
    data: {
      roundId: round2.id,
      userId: user.id,
      currency: Currency.TON,
      betAmount: new Prisma.Decimal("2"),
      status: RoundPlayerStatus.BET_PLACED,
    } as any,
  })

  await db.wallet.update({
    where: { id: wallet.id },
    data: { lockedBalance: new Prisma.Decimal("2") },
  })

  await repairLockedBalances()
  const updatedWallet = await db.wallet.findUnique({ where: { id: wallet.id } })
  console.log("reconciled lockedBalance", updatedWallet?.lockedBalance.toString())

  await repairLockedBalances()
  console.log("reconciliation idempotent")

  await db.houseWallet.update({
    where: { currency: Currency.TON },
    data: { balance: new Prisma.Decimal("10") },
  })

  const round3 = await db.round.create({
    data: {
      status: RoundStatus.WAITING,
      serverSeedHash: "seedhash5",
      serverSeed: "seed5",
    },
  })

  await redis.set(REDIS_KEYS.currentRound, round3.id)
  await redis.set(REDIS_KEYS.roundState(round3.id), RoundStatus.WAITING)

  try {
    await placeBet(user.id, 1, Currency.TON)
  } catch (e) {
    if (e instanceof RiskLimitExceededError) {
      console.log("risk limit rejection ok")
    }
  }

  await db.$disconnect()
  if (redis) await redis.quit()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
