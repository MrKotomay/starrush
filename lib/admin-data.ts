import { Prisma, RoundStatus } from "@prisma/client"
import { db } from "@/lib/db"
import { getAppInternalBaseUrl, getGatewayInternalBaseUrl, getWorkerInternalBaseUrl } from "@/lib/admin"
import { listAdminStakingPools } from "@/services/staking.service"

function decimalToString(value: Prisma.Decimal | null | undefined) {
  return value ? value.toString() : "0"
}

async function fetchInternalJson<T>(url: string) {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "x-internal-key": process.env.INTERNAL_API_KEY ?? "",
      },
      cache: "no-store",
    })

    const payload = (await response.json().catch(() => null)) as T | null
    return {
      ok: response.ok,
      status: response.status,
      payload,
    }
  } catch {
    return {
      ok: false,
      status: 0,
      payload: null as T | null,
    }
  }
}

export async function getAdminDashboardData() {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const [
    totalUsers,
    newUsers24h,
    totalRounds,
    rounds24h,
    activeRound,
    volume24h,
    deposits24h,
    pendingDeposits,
    houseWallets,
    paymentStatuses,
    recentEvents,
    appHealth,
    gatewayHealth,
    gatewayStats,
    workerHealth,
    stakingPools,
  ] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { createdAt: { gte: since24h } } }),
    db.round.count(),
    db.round.count({ where: { createdAt: { gte: since24h } } }),
    db.round.findFirst({
      where: { status: { in: [RoundStatus.WAITING, RoundStatus.RUNNING, RoundStatus.CRASHED] } },
      orderBy: { createdAt: "desc" },
    }),
    db.roundPlayer.aggregate({
      where: { createdAt: { gte: since24h } },
      _sum: { betAmount: true },
      _count: { _all: true },
    }),
    db.depositIntent.aggregate({
      where: { createdAt: { gte: since24h }, status: "COMPLETED" },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    db.depositIntent.count({
      where: { status: { in: ["CREATED", "WAITING_PAYMENT", "SUBMITTED", "CONFIRMING"] } },
    }),
    db.houseWallet.findMany({
      orderBy: { currency: "asc" },
    }),
    db.depositIntent.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    db.roundEventLog.count({ where: { createdAt: { gte: since24h } } }),
    fetchInternalJson(`${getAppInternalBaseUrl()}/api/health/ready`),
    fetchInternalJson(`${getGatewayInternalBaseUrl()}/healthz`),
    fetchInternalJson(`${getGatewayInternalBaseUrl()}/internal/stats`),
    fetchInternalJson(`${getWorkerInternalBaseUrl()}/healthz`),
    listAdminStakingPools(),
  ])

  return {
    users: {
      total: totalUsers,
      last24h: newUsers24h,
    },
    rounds: {
      total: totalRounds,
      last24h: rounds24h,
      active: activeRound
        ? {
            id: activeRound.id,
            status: activeRound.status,
            createdAt: activeRound.createdAt,
            startedAt: activeRound.startedAt,
          }
        : null,
    },
    gameplay: {
      betCount24h: volume24h._count._all,
      betVolume24h: decimalToString(volume24h._sum.betAmount),
      recentEvents24h: recentEvents,
    },
    deposits: {
      completedCount24h: deposits24h._count._all,
      completedAmount24h: decimalToString(deposits24h._sum.amount),
      pendingCount: pendingDeposits,
      byStatus: paymentStatuses.map((entry) => ({
        status: entry.status,
        count: entry._count._all,
      })),
    },
    houseWallets: houseWallets.map((wallet) => ({
      id: wallet.id,
      currency: wallet.currency,
      balance: wallet.balance.toString(),
      updatedAt: wallet.updatedAt,
    })),
    staking: {
      pools: stakingPools,
    },
    health: {
      app: appHealth.payload,
      gateway: gatewayHealth.payload,
      gatewayStats: gatewayStats.payload,
      worker: workerHealth.payload,
    },
  }
}

export async function listAdminUsers(input?: { query?: string; limit?: number }) {
  const take = Math.min(Math.max(input?.limit ?? 50, 1), 100)
  const query = input?.query?.trim()

  return db.user.findMany({
    where: query
      ? {
          OR: [
            { username: { contains: query, mode: "insensitive" } },
            { firstName: { contains: query, mode: "insensitive" } },
            { lastName: { contains: query, mode: "insensitive" } },
            { id: { contains: query, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    take,
    include: {
      wallets: {
        orderBy: { currency: "asc" },
      },
      _count: {
        select: {
          sessions: true,
          ledger: true,
          roundPlayers: true,
          depositIntents: true,
        },
      },
    },
  })
}

export async function getAdminUserDetail(userId: string) {
  return db.user.findUnique({
    where: { id: userId },
    include: {
      wallets: {
        orderBy: { currency: "asc" },
      },
      sessions: {
        orderBy: { createdAt: "desc" },
        take: 20,
      },
      ledger: {
        orderBy: { createdAt: "desc" },
        take: 50,
      },
      depositIntents: {
        orderBy: { createdAt: "desc" },
        take: 30,
      },
      roundPlayers: {
        orderBy: { createdAt: "desc" },
        take: 30,
        include: {
          round: {
            select: {
              id: true,
              status: true,
              crashMultiplier: true,
              createdAt: true,
              finishedAt: true,
            },
          },
        },
      },
    },
  })
}

export async function listAdminRounds(limit = 50) {
  const rounds = await db.round.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 100),
    include: {
      _count: {
        select: {
          players: true,
          events: true,
        },
      },
    },
  })

  return rounds
}

export async function listAdminPayments(limit = 50) {
  const intents = await db.depositIntent.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 100),
    include: {
      user: {
        select: {
          id: true,
          telegramId: true,
          username: true,
          firstName: true,
          lastName: true,
        },
      },
      events: {
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
  })

  return intents
}

export async function listBusinessEvents(limit = 50) {
  const take = Math.min(Math.max(limit, 1), 100)
  const [roundEvents, paymentEvents, giftEvents] = await Promise.all([
    db.roundEventLog.findMany({
      orderBy: { createdAt: "desc" },
      take,
    }),
    db.paymentProviderEvent.findMany({
      orderBy: { createdAt: "desc" },
      take,
    }),
    db.giftIngressEvent.findMany({
      orderBy: { createdAt: "desc" },
      take,
    }),
  ])

  return [...roundEvents.map((entry) => ({
    id: entry.id,
    source: "round",
    type: entry.eventType,
    targetId: entry.roundId,
    payload: entry.payload,
    createdAt: entry.createdAt,
  })), ...paymentEvents.map((entry) => ({
    id: entry.id,
    source: "payment",
    type: entry.eventType,
    targetId: entry.intentId,
    payload: entry.payload,
    createdAt: entry.createdAt,
  })), ...giftEvents.map((entry) => ({
    id: entry.id,
    source: "gift",
    type: "GIFT_INGRESS",
    targetId: entry.userId,
    payload: entry.payload,
    createdAt: entry.createdAt,
  }))]
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .slice(0, take)
}

export async function listAdminAuditLogs(limit = 50) {
  return db.adminAuditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 100),
    include: {
      actorUser: {
        select: {
          id: true,
          telegramId: true,
          username: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  })
}
