import {
  Currency,
  HouseLedgerType,
  LedgerStatus,
  LedgerType,
  Prisma,
  RoundPlayerStatus,
  RoundStatus,
} from "@prisma/client"
import { db } from "../lib/db"
import { redis } from "../lib/redis"
import { creditHouse, getOrCreateHouseWallet } from "../lib/house-ledger.service"
import { applyTransaction, createTransaction } from "../lib/ledger.service"
import { placeBet, RiskLimitExceededError } from "../services/game-betting.service"
import { computeCurrentRoundExposure } from "../services/game-risk.service"
import { REDIS_KEYS } from "../services/game-round.service"

let sequence = 0

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message)
}

function expectDecimal(actual: Prisma.Decimal, expected: Prisma.Decimal, message: string) {
  if (!actual.equals(expected)) {
    throw new Error(`${message}. expected=${expected.toString()} actual=${actual.toString()}`)
  }
}

async function createFundedUser(currency: Currency, balance: Prisma.Decimal) {
  sequence += 1
  const telegramId = BigInt(Date.now() * 1000 + sequence)

  const user = await db.user.create({
    data: {
      telegramId,
      username: `risk_parallel_${telegramId}`,
    },
  })

  const wallet = await db.wallet.create({
    data: {
      userId: user.id,
      currency,
    },
  })

  const deposit = await createTransaction({
    userId: user.id,
    walletId: wallet.id,
    currency,
    amount: balance,
    type: LedgerType.DEPOSIT,
    status: LedgerStatus.PENDING,
    referenceId: `seed:risk-parallel:${telegramId}`,
  })
  await applyTransaction(deposit.id)

  return { user, wallet }
}

async function ensureHouseBalance(currency: Currency, targetBalance: Prisma.Decimal) {
  const wallet = await getOrCreateHouseWallet(currency)
  if (wallet.balance.lt(targetBalance)) {
    await creditHouse({
      currency,
      amount: targetBalance.minus(wallet.balance),
      type: HouseLedgerType.INITIAL_BANKROLL,
      metadata: { source: "risk_parallel_bet_integration_test" },
    })
  }

  await db.houseWallet.update({
    where: { currency },
    data: { balance: targetBalance },
  })
}

async function main() {
  if (!redis) throw new Error("REDIS_NOT_CONFIGURED")

  const currency = Currency.TON
  const stake = new Prisma.Decimal("2")
  const targetBankroll = new Prisma.Decimal("100")
  const maxCrash = new Prisma.Decimal("2")

  await ensureHouseBalance(currency, targetBankroll)

  const users = await Promise.all(
    Array.from({ length: 14 }, () => createFundedUser(currency, new Prisma.Decimal("20")))
  )

  const round = await db.round.create({
    data: {
      status: RoundStatus.WAITING,
      serverSeedHash: `risk-parallel:${Date.now()}:hash`,
      serverSeed: `risk-parallel:${Date.now()}:seed`,
      maxCrash,
      houseEdge: new Prisma.Decimal("0.01"),
    },
  })

  await redis.set(REDIS_KEYS.currentRound, round.id)
  await redis.set(REDIS_KEYS.roundState(round.id), RoundStatus.WAITING)

  // Fill exposure to 80% of round cap (8 out of max 10).
  for (const entry of users.slice(0, 4)) {
    await placeBet(entry.user.id, stake.toNumber(), currency)
  }

  const exposureBeforeParallel = await computeCurrentRoundExposure(currency, round.id)
  expectDecimal(exposureBeforeParallel, new Prisma.Decimal("8"), "exposure before parallel stage")

  const contenders = users.slice(4)
  const results = await Promise.allSettled(
    contenders.map((entry) => placeBet(entry.user.id, stake.toNumber(), currency))
  )

  const accepted = results.filter((result) => result.status === "fulfilled").length
  const rejectedByRisk = results.filter(
    (result) => result.status === "rejected" && result.reason instanceof RiskLimitExceededError
  ).length
  const rejectedOther = results.length - accepted - rejectedByRisk

  expect(accepted === 1, `expected exactly one accepted parallel bet, got ${accepted}`)
  expect(rejectedOther === 0, `unexpected non-risk rejections count=${rejectedOther}`)

  const exposureAfterParallel = await computeCurrentRoundExposure(currency, round.id)
  expectDecimal(exposureAfterParallel, new Prisma.Decimal("10"), "exposure after parallel stage")

  const atRiskPlayers = await db.roundPlayer.count({
    where: {
      roundId: round.id,
      currency,
      status: RoundPlayerStatus.BET_PLACED,
    },
  })
  expect(atRiskPlayers === 5, `expected 5 at-risk players after near-limit contention, got ${atRiskPlayers}`)

  console.log("[PASS] risk parallel bet integration test")
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
