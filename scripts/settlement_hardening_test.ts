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
import { createTransaction, applyTransaction } from "../lib/ledger.service"
import { placeBet } from "../services/game-betting.service"
import { settleLosses } from "../services/game-settlement.service"
import { REDIS_KEYS } from "../services/game-round.service"

const TEST_TIMEOUT_MS = 8000

async function withTimeout<T>(promise: Promise<T>, label: string, timeoutMs = TEST_TIMEOUT_MS): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined
  const timeout = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
  })

  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

async function ensureHouseBankroll(currency: Currency, minimumBalance: Prisma.Decimal) {
  const wallet = await getOrCreateHouseWallet(currency)
  if (wallet.balance.gte(minimumBalance)) return

  await creditHouse({
    currency,
    amount: minimumBalance.minus(wallet.balance),
    type: HouseLedgerType.INITIAL_BANKROLL,
    metadata: { source: "settlement_hardening_test" },
  })
}

async function main() {
  if (!redis) throw new Error("REDIS_NOT_CONFIGURED")
  await ensureHouseBankroll(Currency.TON, new Prisma.Decimal("1000000"))

  console.log("[Test] setup user/wallet")
  const telegramId = BigInt(Date.now())
  const user = await db.user.create({
    data: { telegramId, username: `settle_test_${telegramId}` },
  })

  const wallet = await db.wallet.upsert({
    where: { userId_currency: { userId: user.id, currency: "TON" } },
    create: { userId: user.id, currency: "TON" },
    update: {},
  })

  console.log("[Test] seed deposit")
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

  console.log("[Test] create round WAITING")
  const round = await db.round.create({
    data: {
      status: RoundStatus.WAITING,
      serverSeedHash: "seedhash-settle",
      serverSeed: "seed",
    },
  })

  await redis.set(REDIS_KEYS.currentRound, round.id)
  await redis.set(REDIS_KEYS.roundState(round.id), RoundStatus.WAITING)

  console.log("[Test] place bet")
  await placeBet(user.id, 2, Currency.TON)

  const lockedAfterBet = await db.wallet.findUnique({ where: { id: wallet.id } })
  if (!lockedAfterBet) throw new Error("wallet not found after bet")
  if (!lockedAfterBet.lockedBalance.equals(new Prisma.Decimal("2"))) {
    throw new Error(`lockedBalance not updated by bet: ${lockedAfterBet.lockedBalance.toString()}`)
  }

  console.log("[Test] crash round")
  await db.round.update({ where: { id: round.id }, data: { status: RoundStatus.CRASHED } })

  console.log("[Test] settle losses")
  await withTimeout(settleLosses(round.id), "settleLosses")

  const updatedPlayer = await db.roundPlayer.findFirst({ where: { roundId: round.id, userId: user.id } })
  const updatedWallet = await db.wallet.findUnique({ where: { id: wallet.id } })
  const settlementEntries = await db.ledgerEntry.findMany({
    where: {
      walletId: wallet.id,
      type: LedgerType.BET_LOSS_SETTLEMENT,
      referenceId: `loss:${round.id}:${user.id}`,
    },
  })

  console.log("settlement ok", {
    status: updatedPlayer?.status,
    lockedBalance: updatedWallet?.lockedBalance.toString(),
  })

  if (updatedPlayer?.status !== RoundPlayerStatus.LOST) throw new Error("player not marked LOST")
  if (!updatedWallet || !updatedWallet.lockedBalance.equals(new Prisma.Decimal(0))) {
    throw new Error("lockedBalance not released")
  }
  if (settlementEntries.length !== 1) throw new Error("settlement ledger entry missing or duplicated")

  await withTimeout(settleLosses(round.id), "settleLosses-idempotent")
  console.log("settlement idempotent")

  await db.$disconnect()
  await redis.quit()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
