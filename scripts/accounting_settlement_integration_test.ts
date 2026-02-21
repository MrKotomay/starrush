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
import { REDIS_KEYS, finishRound } from "../services/game-round.service"
import { createTransaction, applyTransaction } from "../lib/ledger.service"
import { placeBet, DuplicateBetError } from "../services/game-betting.service"
import { computeCurrentRoundExposure } from "../services/game-risk.service"
import { cashoutPlayer, PlayerAlreadyCashedOutError, settleLosses } from "../services/game-settlement.service"

const INITIAL_BALANCE = new Prisma.Decimal("10")
const LOSS_BET = new Prisma.Decimal("4")
const CASHOUT_BET = new Prisma.Decimal("2")
const CASHOUT_MULTIPLIER = new Prisma.Decimal("2.5")
let sequence = 0

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message)
}

function expectDecimal(actual: Prisma.Decimal, expected: Prisma.Decimal, message: string) {
  if (!actual.equals(expected)) {
    throw new Error(`${message}. expected=${expected.toString()} actual=${actual.toString()}`)
  }
}

async function expectThrows<T>(run: () => Promise<T>, guard: (error: unknown) => boolean, message: string) {
  try {
    await run()
  } catch (error) {
    if (guard(error)) return
    throw error
  }

  throw new Error(message)
}

async function createUserWalletAndFund(currency: Currency) {
  sequence += 1
  const telegramId = BigInt(Date.now() * 1000 + sequence)

  const user = await db.user.create({
    data: {
      telegramId,
      username: `acct_test_${telegramId}`,
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
    amount: INITIAL_BALANCE,
    type: LedgerType.DEPOSIT,
    status: LedgerStatus.PENDING,
    referenceId: `seed:${currency}:${telegramId}`,
  })

  await applyTransaction(deposit.id)

  return { user, wallet }
}

async function createWaitingRound(tag: string) {
  const round = await db.round.create({
    data: {
      status: RoundStatus.WAITING,
      serverSeedHash: `${tag}:hash`,
      serverSeed: `${tag}:seed`,
    },
  })

  await redis!.set(REDIS_KEYS.currentRound, round.id)
  await redis!.set(REDIS_KEYS.roundState(round.id), RoundStatus.WAITING)

  return round
}

async function loadWallet(walletId: string) {
  const wallet = await db.wallet.findUnique({ where: { id: walletId } })
  if (!wallet) throw new Error(`wallet not found: ${walletId}`)
  return wallet
}

async function loadHouseWallet(currency: Currency) {
  return getOrCreateHouseWallet(currency)
}

async function ensureHouseBankroll(currency: Currency, minimumBalance: Prisma.Decimal) {
  const houseWallet = await loadHouseWallet(currency)
  if (houseWallet.balance.gte(minimumBalance)) return

  await creditHouse({
    currency,
    amount: minimumBalance.minus(houseWallet.balance),
    type: HouseLedgerType.INITIAL_BANKROLL,
    metadata: { source: "accounting_settlement_integration_test" },
  })
}

async function assertLossFlow(currency: Currency) {
  const { user, wallet } = await createUserWalletAndFund(currency)
  const round = await createWaitingRound(`loss:${currency}:${user.id}`)
  const houseBefore = await loadHouseWallet(currency)

  await placeBet(user.id, LOSS_BET.toNumber(), currency)

  const afterBet = await loadWallet(wallet.id)
  expectDecimal(afterBet.balance, INITIAL_BALANCE, `[${currency}] balance after bet`)
  expectDecimal(afterBet.lockedBalance, LOSS_BET, `[${currency}] lockedBalance after bet`)

  const roundAfterBet = await db.round.findUnique({
    where: { id: round.id },
    select: { maxCrash: true },
  })
  if (!roundAfterBet) throw new Error("round not found for exposure check")
  const exposureAfterBet = await computeCurrentRoundExposure(currency, round.id)
  const expectedExposureAfterBet = LOSS_BET.mul(new Prisma.Decimal(roundAfterBet.maxCrash).minus(1))
  expectDecimal(exposureAfterBet, expectedExposureAfterBet, `[${currency}] exposure after bet`)

  await db.round.update({
    where: { id: round.id },
    data: { status: RoundStatus.CRASHED },
  })

  const exposureAfterCrash = await computeCurrentRoundExposure(currency, round.id)
  expectDecimal(exposureAfterCrash, new Prisma.Decimal(0), `[${currency}] exposure after crash status`)

  await settleLosses(round.id)

  const exposureAfterSettlement = await computeCurrentRoundExposure(currency, round.id)
  expectDecimal(exposureAfterSettlement, new Prisma.Decimal(0), `[${currency}] exposure after settlement`)

  const afterLoss = await loadWallet(wallet.id)
  expectDecimal(afterLoss.balance, INITIAL_BALANCE.minus(LOSS_BET), `[${currency}] balance after crash loss settlement`)
  expectDecimal(afterLoss.lockedBalance, new Prisma.Decimal(0), `[${currency}] lockedBalance after crash loss settlement`)

  const houseAfterLoss = await loadHouseWallet(currency)
  expectDecimal(
    houseAfterLoss.balance,
    houseBefore.balance.plus(LOSS_BET),
    `[${currency}] house balance after crash loss settlement`
  )

  const player = await db.roundPlayer.findUnique({
    where: { roundId_userId: { roundId: round.id, userId: user.id } },
  })
  expect(player?.status === RoundPlayerStatus.LOST, `[${currency}] player status after settlement must be LOST`)

  const lossEntry = await db.ledgerEntry.findUnique({
    where: {
      walletId_referenceId_type: {
        walletId: wallet.id,
        referenceId: `loss:${round.id}:${user.id}`,
        type: LedgerType.BET_LOSS_SETTLEMENT,
      },
    },
  })
  expect(lossEntry?.status === LedgerStatus.COMPLETED, `[${currency}] loss entry must be completed`)
  expectDecimal(lossEntry!.amount, LOSS_BET.mul(-1), `[${currency}] loss ledger amount`)

  const beforeFinish = await loadWallet(wallet.id)
  await finishRound(round.id)
  const afterFinish = await loadWallet(wallet.id)
  expectDecimal(afterFinish.balance, beforeFinish.balance, `[${currency}] balance unchanged after round finish`)
  expectDecimal(afterFinish.lockedBalance, beforeFinish.lockedBalance, `[${currency}] lockedBalance unchanged after round finish`)

  console.log(`[PASS] ${currency} loss flow`)
}

async function assertCashoutFlow(currency: Currency) {
  const { user, wallet } = await createUserWalletAndFund(currency)
  const round = await createWaitingRound(`cashout:${currency}:${user.id}`)
  const houseBefore = await loadHouseWallet(currency)

  await placeBet(user.id, CASHOUT_BET.toNumber(), currency)

  const roundAfterBet = await db.round.findUnique({
    where: { id: round.id },
    select: { maxCrash: true },
  })
  if (!roundAfterBet) throw new Error("round not found for cashout exposure check")
  const exposureAfterBet = await computeCurrentRoundExposure(currency, round.id)
  const expectedExposureAfterBet = CASHOUT_BET.mul(new Prisma.Decimal(roundAfterBet.maxCrash).minus(1))
  expectDecimal(exposureAfterBet, expectedExposureAfterBet, `[${currency}] exposure after cashout-flow bet`)

  await db.round.update({
    where: { id: round.id },
    data: { status: RoundStatus.RUNNING, startedAt: new Date(Date.now() - 2000) },
  })

  await redis!.set(REDIS_KEYS.roundState(round.id), RoundStatus.RUNNING)
  await redis!.set(REDIS_KEYS.multiplier(round.id), CASHOUT_MULTIPLIER.toString())

  await cashoutPlayer(round.id, user.id)

  const exposureAfterCashout = await computeCurrentRoundExposure(currency, round.id)
  expectDecimal(exposureAfterCashout, new Prisma.Decimal(0), `[${currency}] exposure after cashout`)

  const expectedProfit = CASHOUT_BET.mul(CASHOUT_MULTIPLIER).minus(CASHOUT_BET)
  const afterCashout = await loadWallet(wallet.id)
  expectDecimal(afterCashout.balance, INITIAL_BALANCE.plus(expectedProfit), `[${currency}] balance after cashout`)
  expectDecimal(afterCashout.lockedBalance, new Prisma.Decimal(0), `[${currency}] lockedBalance after cashout`)

  const houseAfterCashout = await loadHouseWallet(currency)
  expectDecimal(
    houseAfterCashout.balance,
    houseBefore.balance.minus(expectedProfit),
    `[${currency}] house balance after cashout`
  )

  const player = await db.roundPlayer.findUnique({
    where: { roundId_userId: { roundId: round.id, userId: user.id } },
  })
  expect(player?.status === RoundPlayerStatus.CASHED_OUT, `[${currency}] player status after cashout must be CASHED_OUT`)
  expectDecimal(player!.profit!, expectedProfit, `[${currency}] round player profit after cashout`)

  const winEntry = await db.ledgerEntry.findUnique({
    where: {
      walletId_referenceId_type: {
        walletId: wallet.id,
        referenceId: `cashout:${round.id}:${user.id}`,
        type: LedgerType.BET_WIN,
      },
    },
  })
  expect(winEntry?.status === LedgerStatus.COMPLETED, `[${currency}] win entry must be completed`)
  expectDecimal(winEntry!.amount, expectedProfit, `[${currency}] win ledger amount`)

  console.log(`[PASS] ${currency} cashout flow`)
}

async function assertDuplicateBetDoesNotDoubleLock(currency: Currency) {
  const { user, wallet } = await createUserWalletAndFund(currency)
  const round = await createWaitingRound(`dup-bet:${currency}:${user.id}`)
  const betAmount = new Prisma.Decimal("1.5")

  await placeBet(user.id, betAmount.toNumber(), currency)

  const afterFirst = await loadWallet(wallet.id)
  expectDecimal(afterFirst.balance, INITIAL_BALANCE, `[${currency}] duplicate bet: balance after first bet`)
  expectDecimal(afterFirst.lockedBalance, betAmount, `[${currency}] duplicate bet: lockedBalance after first bet`)

  await expectThrows(
    () => placeBet(user.id, betAmount.toNumber(), currency),
    (error) => error instanceof DuplicateBetError,
    `[${currency}] duplicate bet should throw DuplicateBetError`
  )

  const afterRetry = await loadWallet(wallet.id)
  expectDecimal(afterRetry.balance, afterFirst.balance, `[${currency}] duplicate bet: balance unchanged on retry`)
  expectDecimal(afterRetry.lockedBalance, afterFirst.lockedBalance, `[${currency}] duplicate bet: locked unchanged on retry`)

  const betLocks = await db.ledgerEntry.findMany({
    where: {
      walletId: wallet.id,
      type: LedgerType.BET_LOCK,
      referenceId: `bet:${round.id}:${user.id}`,
    },
  })
  expect(betLocks.length === 1, `[${currency}] duplicate bet must create only one BET_LOCK entry`)

  console.log(`[PASS] ${currency} duplicate bet idempotency`)
}

async function assertDuplicateCashoutDoesNotDoubleCredit(currency: Currency) {
  const { user, wallet } = await createUserWalletAndFund(currency)
  const round = await createWaitingRound(`dup-cashout:${currency}:${user.id}`)

  await placeBet(user.id, CASHOUT_BET.toNumber(), currency)

  await db.round.update({
    where: { id: round.id },
    data: { status: RoundStatus.RUNNING, startedAt: new Date(Date.now() - 2000) },
  })

  await redis!.set(REDIS_KEYS.roundState(round.id), RoundStatus.RUNNING)
  await redis!.set(REDIS_KEYS.multiplier(round.id), "2")

  await cashoutPlayer(round.id, user.id)

  const afterFirst = await loadWallet(wallet.id)
  const firstExpectedProfit = CASHOUT_BET
  expectDecimal(afterFirst.balance, INITIAL_BALANCE.plus(firstExpectedProfit), `[${currency}] duplicate cashout: balance after first cashout`)
  expectDecimal(afterFirst.lockedBalance, new Prisma.Decimal(0), `[${currency}] duplicate cashout: locked after first cashout`)

  await expectThrows(
    () => cashoutPlayer(round.id, user.id),
    (error) => error instanceof PlayerAlreadyCashedOutError,
    `[${currency}] duplicate cashout should throw PlayerAlreadyCashedOutError`
  )

  const afterRetry = await loadWallet(wallet.id)
  expectDecimal(afterRetry.balance, afterFirst.balance, `[${currency}] duplicate cashout: balance unchanged on retry`)
  expectDecimal(afterRetry.lockedBalance, afterFirst.lockedBalance, `[${currency}] duplicate cashout: locked unchanged on retry`)

  const winEntries = await db.ledgerEntry.findMany({
    where: {
      walletId: wallet.id,
      type: LedgerType.BET_WIN,
      referenceId: `cashout:${round.id}:${user.id}`,
    },
  })
  expect(winEntries.length === 1, `[${currency}] duplicate cashout must create only one BET_WIN entry`)

  console.log(`[PASS] ${currency} duplicate cashout idempotency`)
}

async function main() {
  if (!redis) {
    throw new Error("REDIS_NOT_CONFIGURED")
  }

  for (const currency of [Currency.TON, Currency.STARS]) {
    await ensureHouseBankroll(currency, new Prisma.Decimal("1000000"))
    await assertLossFlow(currency)
    await assertCashoutFlow(currency)
    await assertDuplicateBetDoesNotDoubleLock(currency)
    await assertDuplicateCashoutDoesNotDoubleCredit(currency)
  }

  console.log("[PASS] accounting settlement integration tests completed")
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
