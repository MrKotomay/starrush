import {
  Currency,
  LedgerType,
  Prisma,
  StakingAssetType,
  StakingEventType,
  StakingPool,
  StakingPosition,
  StakingUnstakeStatus,
} from "@prisma/client"

import { db } from "@/lib/db"
import { applyTransaction, createTransaction } from "@/lib/ledger.service"

const BASIS_POINTS_DENOMINATOR = new Prisma.Decimal(10_000)
const YEAR_MS = new Prisma.Decimal(365 * 24 * 60 * 60 * 1000)
const DEFAULT_APR_BPS = 600
const DEFAULT_UNSTAKE_COOLDOWN_HOURS = 24
const DEFAULT_POOLS = [
  {
    assetId: "TON",
    assetType: StakingAssetType.TON,
    walletCurrency: Currency.TON,
    symbol: "TON",
    icon: "/ton.svg",
    minStake: "0.1",
    rewardReserve: "100",
  },
  {
    assetId: "STARS",
    assetType: StakingAssetType.STARS,
    walletCurrency: Currency.STARS,
    symbol: "Stars",
    icon: "/stars.svg",
    minStake: "1",
    rewardReserve: "100000",
  },
] as const

export const LIVE_STAKING_ASSET_IDS = ["TON", "STARS"] as const

export type LiveStakingAssetId = (typeof LIVE_STAKING_ASSET_IDS)[number]

type DbClient = Prisma.TransactionClient | typeof db

type StakingPoolWithCurrency = Pick<
  StakingPool,
  | "id"
  | "assetId"
  | "assetType"
  | "walletCurrency"
  | "symbol"
  | "icon"
  | "enabled"
  | "aprBps"
  | "minStake"
  | "unstakeCooldownHours"
  | "totalStaked"
  | "rewardReserve"
>

export type StakingOverviewAsset = {
  assetId: string
  assetType: StakingAssetType
  symbol: string
  icon: string
  walletBalance: string
  stakedPrincipal: string
  pendingReward: string
  claimableReward: string
  aprBps: number
  minStake: string
  canStake: boolean
  canClaim: boolean
  canUnstake: boolean
  pendingUnstake: {
    id: string
    amount: string
    status: StakingUnstakeStatus
    availableAt: string
    createdAt: string
  } | null
}

export type StakingOverview = {
  assets: StakingOverviewAsset[]
}

export type AdminStakingPoolView = {
  id: string
  assetId: string
  assetType: StakingAssetType
  walletCurrency: Currency | null
  symbol: string
  icon: string
  enabled: boolean
  aprBps: number
  minStake: string
  unstakeCooldownHours: number
  totalStaked: string
  rewardReserve: string
  positionCount: number
  pendingUnstakeCount: number
  updatedAt: string
}

export class StakingError extends Error {
  readonly code: string

  constructor(code: string, message = code) {
    super(message)
    this.name = "StakingError"
    this.code = code
  }
}

function toDecimal(value: Prisma.Decimal | string | number) {
  const decimal = new Prisma.Decimal(value)
  if (!decimal.isFinite()) {
    throw new StakingError("INVALID_AMOUNT")
  }
  return decimal
}

function parseAssetId(assetId: string): LiveStakingAssetId {
  const normalized = assetId.trim().toUpperCase()
  if (normalized === "TON" || normalized === "STARS") {
    return normalized
  }
  throw new StakingError("UNSUPPORTED_ASSET")
}

function getPoolCurrency(pool: Pick<StakingPoolWithCurrency, "assetId" | "walletCurrency">): Currency {
  if (pool.walletCurrency) return pool.walletCurrency
  if (pool.assetId === "TON" || pool.assetId === "STARS") return pool.assetId
  throw new StakingError("UNSUPPORTED_POOL_CURRENCY")
}

function isIntegerPool(pool: Pick<StakingPoolWithCurrency, "assetId" | "walletCurrency">) {
  return getPoolCurrency(pool) === Currency.STARS
}

function normalizeInputAmount(
  pool: Pick<StakingPoolWithCurrency, "assetId" | "walletCurrency" | "minStake">,
  input: Prisma.Decimal | string | number,
  options?: { enforceMinStake?: boolean },
) {
  const amount = toDecimal(input)
  if (amount.lte(0)) {
    throw new StakingError("INVALID_AMOUNT")
  }
  if (isIntegerPool(pool) && !amount.mod(1).eq(0)) {
    throw new StakingError("INTEGER_AMOUNT_REQUIRED")
  }
  if (options?.enforceMinStake !== false && amount.lt(pool.minStake)) {
    throw new StakingError("MIN_STAKE_NOT_REACHED")
  }
  return amount
}

function normalizeNonNegativeAmount(
  pool: Pick<StakingPoolWithCurrency, "assetId" | "walletCurrency">,
  input: Prisma.Decimal | string | number,
) {
  const amount = toDecimal(input)
  if (amount.lt(0)) {
    throw new StakingError("INVALID_AMOUNT")
  }
  if (isIntegerPool(pool) && !amount.mod(1).eq(0)) {
    throw new StakingError("INTEGER_AMOUNT_REQUIRED")
  }
  return amount
}

function normalizeSignedAmount(input: Prisma.Decimal | string | number) {
  const amount = toDecimal(input)
  if (amount.eq(0)) {
    return new Prisma.Decimal(0)
  }
  return amount
}

function calculateAccruedReward(
  principal: Prisma.Decimal,
  aprBps: number,
  lastAccruedAt: Date,
  now: Date,
) {
  if (principal.lte(0)) return new Prisma.Decimal(0)
  const elapsedMs = Math.max(0, now.getTime() - lastAccruedAt.getTime())
  if (elapsedMs <= 0 || aprBps <= 0) return new Prisma.Decimal(0)

  return principal
    .mul(aprBps)
    .mul(elapsedMs)
    .div(BASIS_POINTS_DENOMINATOR)
    .div(YEAR_MS)
}

function claimableRewardForPool(
  pool: Pick<StakingPoolWithCurrency, "assetId" | "walletCurrency">,
  pendingReward: Prisma.Decimal,
) {
  if (pendingReward.lte(0)) return new Prisma.Decimal(0)
  return isIntegerPool(pool) ? pendingReward.floor() : pendingReward
}

function decimalString(value: Prisma.Decimal | null | undefined) {
  return value ? value.toString() : "0"
}

function toDateIso(value: Date) {
  return value.toISOString()
}

async function ensureDefaultStakingPools(client: DbClient = db) {
  for (const pool of DEFAULT_POOLS) {
    await client.stakingPool.upsert({
      where: { assetId: pool.assetId },
      update: {},
      create: {
        assetId: pool.assetId,
        assetType: pool.assetType,
        walletCurrency: pool.walletCurrency,
        symbol: pool.symbol,
        icon: pool.icon,
        enabled: true,
        aprBps: DEFAULT_APR_BPS,
        minStake: new Prisma.Decimal(pool.minStake),
        unstakeCooldownHours: DEFAULT_UNSTAKE_COOLDOWN_HOURS,
        rewardReserve: new Prisma.Decimal(pool.rewardReserve),
      },
    })
  }
}

async function acquireStakingUserLock(tx: Prisma.TransactionClient, userId: string) {
  await tx.$executeRaw`SET LOCAL lock_timeout = '2s'`
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(
      hashtext(${`starrush:staking:user`}),
      hashtext(${userId})
    )
  `
}

async function lockStakingPoolById(tx: Prisma.TransactionClient, poolId: string) {
  await tx.$queryRaw`SELECT id FROM "StakingPool" WHERE id = ${poolId} FOR UPDATE`
}

async function lockStakingPoolByAssetId(tx: Prisma.TransactionClient, assetId: string) {
  await tx.$queryRaw`SELECT id FROM "StakingPool" WHERE "assetId" = ${assetId} FOR UPDATE`
}

async function lockStakingPositionById(tx: Prisma.TransactionClient, positionId: string) {
  await tx.$queryRaw`SELECT id FROM "StakingPosition" WHERE id = ${positionId} FOR UPDATE`
}

async function lockStakingPositionByUserPool(tx: Prisma.TransactionClient, userId: string, poolId: string) {
  await tx.$queryRaw`
    SELECT id
    FROM "StakingPosition"
    WHERE "userId" = ${userId} AND "poolId" = ${poolId}
    FOR UPDATE
  `
}

function previewAccruedPosition(
  pool: StakingPoolWithCurrency,
  position: StakingPosition,
  now: Date,
) {
  const accruedReward = calculateAccruedReward(position.stakedPrincipal, pool.aprBps, position.lastAccruedAt, now)
  if (accruedReward.eq(0) && position.lastAccruedAt.getTime() === now.getTime()) {
    return position
  }

  return {
    ...position,
    pendingReward: position.pendingReward.plus(accruedReward),
    lastAccruedAt: now,
  } satisfies StakingPosition
}

async function settleAccruedPosition(
  tx: Prisma.TransactionClient,
  pool: StakingPoolWithCurrency,
  position: StakingPosition,
  now: Date,
) {
  const accruedReward = calculateAccruedReward(position.stakedPrincipal, pool.aprBps, position.lastAccruedAt, now)
  if (accruedReward.eq(0) && position.lastAccruedAt.getTime() === now.getTime()) {
    return position
  }

  return tx.stakingPosition.update({
    where: { id: position.id },
    data: {
      pendingReward: position.pendingReward.plus(accruedReward),
      lastAccruedAt: now,
    },
  })
}

async function getOrCreatePosition(
  tx: Prisma.TransactionClient,
  userId: string,
  poolId: string,
  now: Date,
) {
  await lockStakingPositionByUserPool(tx, userId, poolId)
  const position = await tx.stakingPosition.upsert({
    where: { userId_poolId: { userId, poolId } },
    update: {},
    create: {
      userId,
      poolId,
      lastAccruedAt: now,
    },
  })
  await lockStakingPositionById(tx, position.id)
  return position
}

async function processMatureUnstakes(
  tx: Prisma.TransactionClient,
  userId: string,
  now: Date,
) {
  const requests = await tx.stakingUnstakeRequest.findMany({
    where: {
      userId,
      status: StakingUnstakeStatus.PENDING,
      availableAt: { lte: now },
    },
    orderBy: { createdAt: "asc" },
  })

  for (const pendingRequest of requests) {
    await tx.$queryRaw`
      SELECT id
      FROM "StakingUnstakeRequest"
      WHERE id = ${pendingRequest.id}
      FOR UPDATE
    `

    const request = await tx.stakingUnstakeRequest.findUnique({
      where: { id: pendingRequest.id },
      include: {
        pool: true,
        position: true,
      },
    })
    if (!request) {
      continue
    }
    if (request.status !== StakingUnstakeStatus.PENDING || request.availableAt > now) {
      continue
    }

    await lockStakingPoolById(tx, request.poolId)
    await lockStakingPositionById(tx, request.positionId)

    const position = await tx.stakingPosition.findUnique({
      where: { id: request.positionId },
    })
    if (!position) {
      continue
    }

    const currency = getPoolCurrency(request.pool)
    const entry = await createTransaction(
      {
        userId,
        currency,
        amount: request.amount,
        type: LedgerType.STAKING_UNSTAKE,
        referenceId: `staking-unstake:${request.id}`,
        metadata: {
          source: "staking",
          assetId: request.pool.assetId,
          requestId: request.id,
          poolId: request.poolId,
          positionId: request.positionId,
        },
      },
      tx,
    )
    const applied = await applyTransaction(entry.id, tx)

    await tx.stakingPosition.update({
      where: { id: request.positionId },
      data: {
        totalUnstaked: position.totalUnstaked.plus(request.amount),
      },
    })

    await tx.stakingUnstakeRequest.update({
      where: { id: request.id },
      data: {
        status: StakingUnstakeStatus.COMPLETED,
        completedAt: now,
      },
    })

    await tx.stakingPositionEvent.create({
      data: {
        poolId: request.poolId,
        userId,
        positionId: request.positionId,
        unstakeRequestId: request.id,
        eventType: StakingEventType.UNSTAKE_COMPLETE,
        amount: request.amount,
        metadata: {
          source: "staking",
          ledgerId: applied.id,
        },
      },
    })
  }
}

function buildOverviewAsset(input: {
  pool: StakingPoolWithCurrency
  position?: StakingPosition | null
  walletBalance?: Prisma.Decimal
  pendingUnstake?: {
    id: string
    amount: Prisma.Decimal
    status: StakingUnstakeStatus
    availableAt: Date
    createdAt: Date
  } | null
}) {
  const walletBalance = input.walletBalance ?? new Prisma.Decimal(0)
  const position = input.position
  const stakedPrincipal = position?.stakedPrincipal ?? new Prisma.Decimal(0)
  const rawPendingReward = position?.pendingReward ?? new Prisma.Decimal(0)
  const claimableReward = claimableRewardForPool(input.pool, rawPendingReward)
  const pendingReward = isIntegerPool(input.pool) ? claimableReward : rawPendingReward

  return {
    assetId: input.pool.assetId,
    assetType: input.pool.assetType,
    symbol: input.pool.symbol,
    icon: input.pool.icon,
    walletBalance: decimalString(walletBalance),
    stakedPrincipal: decimalString(stakedPrincipal),
    pendingReward: decimalString(pendingReward),
    claimableReward: decimalString(claimableReward),
    aprBps: input.pool.aprBps,
    minStake: decimalString(input.pool.minStake),
    canStake: input.pool.enabled && walletBalance.gte(input.pool.minStake),
    canClaim: claimableReward.gt(0) && input.pool.rewardReserve.gte(claimableReward),
    canUnstake: stakedPrincipal.gt(0) && !input.pendingUnstake,
    pendingUnstake: input.pendingUnstake
      ? {
          id: input.pendingUnstake.id,
          amount: decimalString(input.pendingUnstake.amount),
          status: input.pendingUnstake.status,
          availableAt: toDateIso(input.pendingUnstake.availableAt),
          createdAt: toDateIso(input.pendingUnstake.createdAt),
        }
      : null,
  } satisfies StakingOverviewAsset
}

async function buildOverviewWithinTransaction(tx: Prisma.TransactionClient, userId: string): Promise<StakingOverview> {
  const now = new Date()

  await ensureDefaultStakingPools(tx)

  const pools = await tx.stakingPool.findMany({
    where: {
      assetId: { in: [...LIVE_STAKING_ASSET_IDS] },
    },
  })
  const poolIds = pools.map((pool) => pool.id)

  const [positions, pendingUnstakes, wallets] = await Promise.all([
    tx.stakingPosition.findMany({
      where: {
        userId,
        poolId: { in: poolIds },
      },
    }),
    tx.stakingUnstakeRequest.findMany({
      where: {
        userId,
        poolId: { in: poolIds },
        status: StakingUnstakeStatus.PENDING,
      },
      orderBy: { createdAt: "desc" },
    }),
    tx.wallet.findMany({
      where: {
        userId,
        currency: { in: [Currency.TON, Currency.STARS] },
      },
    }),
  ])

  const poolsById = new Map(pools.map((pool) => [pool.id, pool]))
  const positionsByPoolId = new Map<string, StakingPosition>()
  for (const position of positions) {
    const pool = poolsById.get(position.poolId)
    if (!pool) continue
    positionsByPoolId.set(position.poolId, previewAccruedPosition(pool, position, now))
  }

  const pendingUnstakesByPoolId = new Map(pendingUnstakes.map((entry) => [entry.poolId, entry]))
  const walletByCurrency = new Map(wallets.map((wallet) => [wallet.currency, wallet.balance]))
  const orderedPools = DEFAULT_POOLS
    .map((entry) => pools.find((pool) => pool.assetId === entry.assetId))
    .filter((pool): pool is (typeof pools)[number] => Boolean(pool))

  return {
    assets: orderedPools.map((pool) =>
      buildOverviewAsset({
        pool,
        position: positionsByPoolId.get(pool.id) ?? null,
        walletBalance: walletByCurrency.get(getPoolCurrency(pool)),
        pendingUnstake: pendingUnstakesByPoolId.get(pool.id)
          ? {
              id: pendingUnstakesByPoolId.get(pool.id)!.id,
              amount: pendingUnstakesByPoolId.get(pool.id)!.amount,
              status: pendingUnstakesByPoolId.get(pool.id)!.status,
              availableAt: pendingUnstakesByPoolId.get(pool.id)!.availableAt,
              createdAt: pendingUnstakesByPoolId.get(pool.id)!.createdAt,
            }
          : null,
      }),
    ),
  }
}

async function getPoolOrThrow(
  tx: Prisma.TransactionClient,
  assetIdInput: string,
) {
  const assetId = parseAssetId(assetIdInput)
  await lockStakingPoolByAssetId(tx, assetId)
  const pool = await tx.stakingPool.findUnique({
    where: { assetId },
  })

  if (!pool) {
    throw new StakingError("POOL_NOT_FOUND")
  }

  return pool
}

async function getAccruedPositionOrNull(
  tx: Prisma.TransactionClient,
  userId: string,
  pool: StakingPoolWithCurrency,
  now: Date,
) {
  const position = await tx.stakingPosition.findUnique({
    where: {
      userId_poolId: {
        userId,
        poolId: pool.id,
      },
    },
  })

  if (!position) return null
  await lockStakingPositionById(tx, position.id)

  const lockedPosition = await tx.stakingPosition.findUnique({
    where: { id: position.id },
  })
  if (!lockedPosition) return null

  return settleAccruedPosition(tx, pool, lockedPosition, now)
}

export async function getStakingOverview(userId: string): Promise<StakingOverview> {
  return db.$transaction((tx) => buildOverviewWithinTransaction(tx, userId))
}

export async function syncStakingOverview(userId: string): Promise<StakingOverview> {
  return db.$transaction(async (tx) => {
    const now = new Date()

    await ensureDefaultStakingPools(tx)
    await acquireStakingUserLock(tx, userId)
    await processMatureUnstakes(tx, userId, now)

    return buildOverviewWithinTransaction(tx, userId)
  })
}

export async function getStakingAssetOverview(userId: string, assetId: string) {
  const normalized = parseAssetId(assetId)
  const overview = await getStakingOverview(userId)
  const asset = overview.assets.find((entry) => entry.assetId === normalized)
  if (!asset) {
    throw new StakingError("POOL_NOT_FOUND")
  }
  return asset
}

export async function stakeAsset(input: {
  userId: string
  assetId: string
  amount: Prisma.Decimal | string | number
}) {
  const assetId = parseAssetId(input.assetId)

  await db.$transaction(async (tx) => {
    const now = new Date()

    await ensureDefaultStakingPools(tx)
    await acquireStakingUserLock(tx, input.userId)
    await processMatureUnstakes(tx, input.userId, now)

    const pool = await getPoolOrThrow(tx, assetId)
    if (!pool.enabled) {
      throw new StakingError("POOL_DISABLED")
    }

    const amount = normalizeInputAmount(pool, input.amount)
    const position = await getOrCreatePosition(tx, input.userId, pool.id, now)
    const accruedPosition = await settleAccruedPosition(tx, pool, position, now)

    const entry = await createTransaction(
      {
        userId: input.userId,
        currency: getPoolCurrency(pool),
        amount: amount.mul(-1),
        type: LedgerType.STAKING_STAKE,
        referenceId: `staking-stake:${assetId}:${input.userId}:${now.getTime()}`,
        metadata: {
          source: "staking",
          assetId,
          poolId: pool.id,
        },
      },
      tx,
    ).catch((error: unknown) => {
      if (error instanceof Error && error.message === "INSUFFICIENT_FUNDS") {
        throw new StakingError("INSUFFICIENT_BALANCE")
      }
      throw error
    })

    const applied = await applyTransaction(entry.id, tx)

    await tx.stakingPosition.update({
      where: { id: accruedPosition.id },
      data: {
        stakedPrincipal: accruedPosition.stakedPrincipal.plus(amount),
        lastAccruedAt: now,
      },
    })

    await tx.stakingPool.update({
      where: { id: pool.id },
      data: {
        totalStaked: pool.totalStaked.plus(amount),
      },
    })

    await tx.stakingPositionEvent.create({
      data: {
        poolId: pool.id,
        userId: input.userId,
        positionId: accruedPosition.id,
        eventType: StakingEventType.STAKE,
        amount,
        metadata: {
          source: "staking",
          ledgerId: applied.id,
        },
      },
    })
  })

  return {
    asset: await getStakingAssetOverview(input.userId, assetId),
  }
}

export async function claimAssetRewards(input: {
  userId: string
  assetId: string
}) {
  const assetId = parseAssetId(input.assetId)
  let claimedAmount = new Prisma.Decimal(0)

  await db.$transaction(async (tx) => {
    const now = new Date()

    await ensureDefaultStakingPools(tx)
    await acquireStakingUserLock(tx, input.userId)
    await processMatureUnstakes(tx, input.userId, now)

    const pool = await getPoolOrThrow(tx, assetId)
    const position = await getAccruedPositionOrNull(tx, input.userId, pool, now)
    if (!position) {
      return
    }

    const claimable = claimableRewardForPool(pool, position.pendingReward)
    if (claimable.lte(0)) {
      return
    }
    if (pool.rewardReserve.lt(claimable)) {
      throw new StakingError("REWARD_RESERVE_EXHAUSTED")
    }

    const entry = await createTransaction(
      {
        userId: input.userId,
        currency: getPoolCurrency(pool),
        amount: claimable,
        type: LedgerType.STAKING_REWARD,
        referenceId: `staking-claim:${assetId}:${input.userId}:${now.getTime()}`,
        metadata: {
          source: "staking",
          assetId,
          poolId: pool.id,
        },
      },
      tx,
    )
    const applied = await applyTransaction(entry.id, tx)

    await tx.stakingPosition.update({
      where: { id: position.id },
      data: {
        pendingReward: position.pendingReward.minus(claimable),
        totalClaimed: position.totalClaimed.plus(claimable),
        lastAccruedAt: now,
      },
    })

    await tx.stakingPool.update({
      where: { id: pool.id },
      data: {
        rewardReserve: pool.rewardReserve.minus(claimable),
      },
    })

    await tx.stakingPositionEvent.create({
      data: {
        poolId: pool.id,
        userId: input.userId,
        positionId: position.id,
        eventType: StakingEventType.CLAIM,
        amount: claimable,
        metadata: {
          source: "staking",
          ledgerId: applied.id,
        },
      },
    })

    claimedAmount = claimable
  })

  return {
    claimedAmount: claimedAmount.toString(),
    asset: await getStakingAssetOverview(input.userId, assetId),
  }
}

export async function requestAssetUnstake(input: {
  userId: string
  assetId: string
  amount: Prisma.Decimal | string | number
}) {
  const assetId = parseAssetId(input.assetId)
  let createdRequestId: string | null = null

  await db.$transaction(async (tx) => {
    const now = new Date()

    await ensureDefaultStakingPools(tx)
    await acquireStakingUserLock(tx, input.userId)
    await processMatureUnstakes(tx, input.userId, now)

    const pool = await getPoolOrThrow(tx, assetId)
    const amount = normalizeInputAmount(pool, input.amount, { enforceMinStake: false })
    const position = await getAccruedPositionOrNull(tx, input.userId, pool, now)

    if (!position || position.stakedPrincipal.lt(amount)) {
      throw new StakingError("INSUFFICIENT_STAKED_BALANCE")
    }

    const existingPending = await tx.stakingUnstakeRequest.findFirst({
      where: {
        userId: input.userId,
        poolId: pool.id,
        status: StakingUnstakeStatus.PENDING,
      },
      orderBy: { createdAt: "desc" },
    })
    if (existingPending) {
      throw new StakingError("PENDING_UNSTAKE_EXISTS")
    }

    const availableAt = new Date(now.getTime() + pool.unstakeCooldownHours * 60 * 60 * 1000)

    await tx.stakingPosition.update({
      where: { id: position.id },
      data: {
        stakedPrincipal: position.stakedPrincipal.minus(amount),
        lastAccruedAt: now,
      },
    })

    await tx.stakingPool.update({
      where: { id: pool.id },
      data: {
        totalStaked: pool.totalStaked.minus(amount),
      },
    })

    const request = await tx.stakingUnstakeRequest.create({
      data: {
        userId: input.userId,
        poolId: pool.id,
        positionId: position.id,
        amount,
        status: StakingUnstakeStatus.PENDING,
        availableAt,
      },
    })
    createdRequestId = request.id

    await tx.stakingPositionEvent.create({
      data: {
        poolId: pool.id,
        userId: input.userId,
        positionId: position.id,
        unstakeRequestId: request.id,
        eventType: StakingEventType.UNSTAKE_REQUEST,
        amount,
        metadata: {
          source: "staking",
          availableAt: request.availableAt.toISOString(),
        },
      },
    })
  })

  return {
    requestId: createdRequestId,
    asset: await getStakingAssetOverview(input.userId, assetId),
  }
}

export async function listAdminStakingPools(): Promise<AdminStakingPoolView[]> {
  await ensureDefaultStakingPools(db)

  const [pools, positionCounts, pendingUnstakeCounts] = await Promise.all([
    db.stakingPool.findMany({
      where: {
        assetId: { in: [...LIVE_STAKING_ASSET_IDS] },
      },
      orderBy: { assetId: "asc" },
    }),
    db.stakingPosition.groupBy({
      by: ["poolId"],
      _count: { _all: true },
    }),
    db.stakingUnstakeRequest.groupBy({
      by: ["poolId"],
      where: {
        status: StakingUnstakeStatus.PENDING,
      },
      _count: { _all: true },
    }),
  ])

  const positionCountByPoolId = new Map(positionCounts.map((entry) => [entry.poolId, entry._count._all]))
  const pendingCountByPoolId = new Map(pendingUnstakeCounts.map((entry) => [entry.poolId, entry._count._all]))

  return DEFAULT_POOLS.map((entry) => pools.find((pool) => pool.assetId === entry.assetId))
    .filter((pool): pool is (typeof pools)[number] => Boolean(pool))
    .map((pool) => ({
      id: pool.id,
      assetId: pool.assetId,
      assetType: pool.assetType,
      walletCurrency: pool.walletCurrency,
      symbol: pool.symbol,
      icon: pool.icon,
      enabled: pool.enabled,
      aprBps: pool.aprBps,
      minStake: pool.minStake.toString(),
      unstakeCooldownHours: pool.unstakeCooldownHours,
      totalStaked: pool.totalStaked.toString(),
      rewardReserve: pool.rewardReserve.toString(),
      positionCount: positionCountByPoolId.get(pool.id) ?? 0,
      pendingUnstakeCount: pendingCountByPoolId.get(pool.id) ?? 0,
      updatedAt: pool.updatedAt.toISOString(),
    }))
}

export async function updateStakingPoolConfig(input: {
  assetId: string
  enabled?: boolean
  aprBps?: number
  minStake?: Prisma.Decimal | string | number
  unstakeCooldownHours?: number
  rewardReserveDelta?: Prisma.Decimal | string | number
}, tx?: Prisma.TransactionClient) {
  const assetId = parseAssetId(input.assetId)

  const run = async (client: Prisma.TransactionClient) => {
    const now = new Date()

    await ensureDefaultStakingPools(client)
    const pool = await getPoolOrThrow(client, assetId)

    const nextEnabled = input.enabled ?? pool.enabled
    const nextAprBps = input.aprBps ?? pool.aprBps
    const nextCooldown = input.unstakeCooldownHours ?? pool.unstakeCooldownHours
    const nextMinStake =
      input.minStake !== undefined ? normalizeNonNegativeAmount(pool, input.minStake) : pool.minStake
    const signedRewardReserveDelta =
      input.rewardReserveDelta !== undefined ? normalizeSignedAmount(input.rewardReserveDelta) : new Prisma.Decimal(0)

    if (!Number.isInteger(nextAprBps) || nextAprBps < 0 || nextAprBps > 1_000_000) {
      throw new StakingError("INVALID_APR")
    }
    if (!Number.isInteger(nextCooldown) || nextCooldown < 0 || nextCooldown > 24 * 365) {
      throw new StakingError("INVALID_UNSTAKE_COOLDOWN")
    }
    if (isIntegerPool(pool) && !nextMinStake.mod(1).eq(0)) {
      throw new StakingError("INTEGER_AMOUNT_REQUIRED")
    }

    const nextRewardReserve = pool.rewardReserve.plus(signedRewardReserveDelta)
    if (nextRewardReserve.lt(0)) {
      throw new StakingError("REWARD_RESERVE_UNDERFLOW")
    }

    const updatedPool = await client.stakingPool.update({
      where: { id: pool.id },
      data: {
        enabled: nextEnabled,
        aprBps: nextAprBps,
        minStake: nextMinStake,
        unstakeCooldownHours: nextCooldown,
        rewardReserve: nextRewardReserve,
      },
    })

    await client.stakingPositionEvent.create({
      data: {
        poolId: pool.id,
        eventType: StakingEventType.ADMIN_POOL_UPDATED,
        metadata: {
          source: "admin",
          enabled: nextEnabled,
          aprBps: nextAprBps,
          minStake: nextMinStake.toString(),
          unstakeCooldownHours: nextCooldown,
          updatedAt: now.toISOString(),
        },
      },
    })

    if (!signedRewardReserveDelta.eq(0)) {
      await client.stakingPositionEvent.create({
        data: {
          poolId: pool.id,
          eventType: StakingEventType.ADMIN_RESERVE_ADJUSTMENT,
          amount: signedRewardReserveDelta,
          metadata: {
            source: "admin",
            rewardReserve: nextRewardReserve.toString(),
          },
        },
      })
    }

    return updatedPool
  }

  if (tx) {
    return run(tx)
  }

  return db.$transaction((innerTx) => run(innerTx))
}
