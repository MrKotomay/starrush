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
import { placeBet, RiskLimitExceededError, activateQueuedBetsForRound } from "../services/game-betting.service"
import { REDIS_KEYS } from "../services/game-round.service"

let sequence = 0

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message)
}

async function createFundedUser(currency: Currency, balance: Prisma.Decimal, prefix: string) {
  sequence += 1
  const telegramId = BigInt(Date.now() * 1000 + sequence)

  const user = await db.user.create({
    data: {
      telegramId,
      username: `${prefix}_${telegramId}`,
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
    referenceId: `seed:queued-risk:${telegramId}`,
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
      metadata: { source: "queued_bet_risk_integration_test" },
    })
  }

  await db.houseWallet.update({
    where: { currency },
    data: { balance: targetBalance },
  })
}

async function createRunningRound(maxCrash: Prisma.Decimal) {
  return db.round.create({
    data: {
      status: RoundStatus.RUNNING,
      serverSeedHash: `queued-risk:${Date.now()}:hash`,
      serverSeed: `queued-risk:${Date.now()}:seed`,
      houseEdge: new Prisma.Decimal("0.01"),
      maxCrash,
      startedAt: new Date(Date.now() - 1000),
    },
  })
}

async function createWaitingRound(maxCrash: Prisma.Decimal) {
  return db.round.create({
    data: {
      status: RoundStatus.WAITING,
      serverSeedHash: `queued-risk:${Date.now()}:next-hash`,
      serverSeed: `queued-risk:${Date.now()}:next-seed`,
      houseEdge: new Prisma.Decimal("0.01"),
      maxCrash,
    },
  })
}

async function testQueuedAcceptanceCap() {
  const currency = Currency.TON
  const stake = new Prisma.Decimal("2")
  const bankroll = new Prisma.Decimal("100")
  const maxCrash = new Prisma.Decimal("2")

  await ensureHouseBalance(currency, bankroll)

  const runningRound = await createRunningRound(maxCrash)
  if (!redis) throw new Error("REDIS_NOT_CONFIGURED")
  await redis.set(REDIS_KEYS.currentRound, runningRound.id)
  await redis.set(REDIS_KEYS.roundState(runningRound.id), RoundStatus.RUNNING)

  const users = await Promise.all(
    Array.from({ length: 10 }, () => createFundedUser(currency, new Prisma.Decimal("20"), "queued_limit"))
  )
  const userIds = users.map((entry) => entry.user.id)

  const results = await Promise.allSettled(users.map((entry) => placeBet(entry.user.id, stake.toNumber(), currency)))
  const accepted = results.filter((result) => result.status === "fulfilled").length
  const riskRejected = results.filter(
    (result) => result.status === "rejected" && result.reason instanceof RiskLimitExceededError
  ).length
  const otherRejected = results.length - accepted - riskRejected

  expect(accepted === 5, `expected 5 queued bets accepted near cap, got ${accepted}`)
  expect(otherRejected === 0, `unexpected non-risk rejections count=${otherRejected}`)

  const queuedRows = await db.roundQueuedBet.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true },
  })
  expect(queuedRows.length === 5, `expected 5 queued rows, got ${queuedRows.length}`)

  const nextRound = await createWaitingRound(maxCrash)
  await activateQueuedBetsForRound(nextRound.id)

  const activatedCount = await db.roundPlayer.count({
    where: {
      roundId: nextRound.id,
      userId: { in: userIds },
      status: RoundPlayerStatus.BET_PLACED,
      currency,
    },
  })
  expect(activatedCount === 5, `expected 5 activated queued bets, got ${activatedCount}`)

  const remainingQueueRows = await db.roundQueuedBet.findMany({
    where: { userId: { in: userIds } },
    select: { id: true },
  })
  expect(remainingQueueRows.length === 0, "queued rows should be empty after activation")

  console.log("[PASS] queued acceptance respects risk caps")
}

async function testQueuedActivationDuplicateReleasesLock() {
  const currency = Currency.TON
  const maxCrash = new Prisma.Decimal("2")
  const runningRound = await createRunningRound(maxCrash)
  if (!redis) throw new Error("REDIS_NOT_CONFIGURED")
  await redis.set(REDIS_KEYS.currentRound, runningRound.id)
  await redis.set(REDIS_KEYS.roundState(runningRound.id), RoundStatus.RUNNING)

  const funded = await createFundedUser(currency, new Prisma.Decimal("10"), "queued_dup")
  const queued = await placeBet(funded.user.id, 1, currency)
  expect(queued.mode === "queued", "expected queued bet mode")

  const walletBefore = await db.wallet.findUnique({
    where: { userId_currency: { userId: funded.user.id, currency } },
  })
  if (!walletBefore) throw new Error("wallet not found before activation duplicate test")
  expect(walletBefore.lockedBalance.equals(new Prisma.Decimal("1")), "queued lock must reserve stake before activation")

  const nextRound = await createWaitingRound(maxCrash)
  await db.roundPlayer.create({
    data: {
      roundId: nextRound.id,
      userId: funded.user.id,
      currency,
      betAmount: new Prisma.Decimal("1"),
    } as any,
  })

  await activateQueuedBetsForRound(nextRound.id)

  const queueAfter = await db.roundQueuedBet.findUnique({
    where: { userId: funded.user.id },
    select: { id: true },
  })
  expect(!queueAfter, "queued row must be removed when duplicate activation is detected")

  const walletAfter = await db.wallet.findUnique({
    where: { userId_currency: { userId: funded.user.id, currency } },
  })
  if (!walletAfter) throw new Error("wallet not found after activation duplicate test")
  expect(walletAfter.lockedBalance.equals(new Prisma.Decimal("0")), "queued lock must be released on duplicate activation")

  console.log("[PASS] queued duplicate activation releases locked stake")
}

async function main() {
  if (!redis) throw new Error("REDIS_NOT_CONFIGURED")
  await testQueuedAcceptanceCap()
  await testQueuedActivationDuplicateReleasesLock()
  console.log("[PASS] queued risk integration test")
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
