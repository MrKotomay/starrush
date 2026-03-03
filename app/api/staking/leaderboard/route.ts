import { z } from "zod"
import { getCurrentUser } from "@/lib/auth"
import { db } from "@/lib/db"
import { jsonUtf8 } from "@/lib/http"

type LeaderboardSort = "gifts" | "ton" | "stars"

const querySchema = z.object({
  sortBy: z.enum(["gifts", "ton", "stars"]).default("gifts"),
  limit: z.coerce.number().int().min(5).max(200).default(50),
})

function toFiniteNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (value && typeof value === "object" && "toString" in value) {
    const parsed = Number.parseFloat(String(value))
    if (Number.isFinite(parsed)) return parsed
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function buildDisplayName(input: {
  userId: string
  username: string | null
  firstName: string | null
  lastName: string | null
}) {
  const username = input.username?.trim()
  if (username) return username

  const firstName = input.firstName?.trim() ?? ""
  const lastName = input.lastName?.trim() ?? ""
  const fullName = `${firstName} ${lastName}`.trim()
  if (fullName) return fullName

  return `player_${input.userId.slice(-6)}`
}

function metricValue(sortBy: LeaderboardSort, input: { gifts: number; tonBalance: number; starsBalance: number }) {
  if (sortBy === "ton") return input.tonBalance
  if (sortBy === "stars") return input.starsBalance
  return input.gifts
}

export async function GET(req: Request) {
  const current = await getCurrentUser()
  if (!current) {
    return jsonUtf8({ ok: false, error: "UNAUTHORIZED" }, { status: 401 })
  }

  const url = new URL(req.url)
  const parsed = querySchema.safeParse({
    sortBy: url.searchParams.get("sortBy") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  })

  const sortBy: LeaderboardSort = parsed.success ? parsed.data.sortBy : "gifts"
  const limit = parsed.success ? parsed.data.limit : 50

  const users = await db.user.findMany({
    select: {
      id: true,
      username: true,
      firstName: true,
      lastName: true,
      photoUrl: true,
      createdAt: true,
      wallets: {
        select: {
          currency: true,
          balance: true,
        },
      },
    },
  })

  const rows = users
    .map((user) => {
      const tonWallet = user.wallets.find((wallet) => wallet.currency === "TON")
      const starsWallet = user.wallets.find((wallet) => wallet.currency === "STARS")

      const tonBalance = Math.max(0, toFiniteNumber(tonWallet?.balance))
      const starsBalance = Math.max(0, toFiniteNumber(starsWallet?.balance))
      const gifts = Math.max(0, starsBalance)

      return {
        userId: user.id,
        username: user.username,
        displayName: buildDisplayName({
          userId: user.id,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
        }),
        avatarUrl: user.photoUrl,
        createdAtMs: user.createdAt.getTime(),
        tonBalance,
        starsBalance,
        gifts,
      }
    })
    .filter((entry) => {
      if (entry.userId === current.user.id) return true
      return entry.gifts > 0 || entry.tonBalance > 0 || entry.starsBalance > 0
    })

  rows.sort((a, b) => {
    const metricDiff = metricValue(sortBy, b) - metricValue(sortBy, a)
    if (Math.abs(metricDiff) > 1e-9) return metricDiff

    if (a.createdAtMs !== b.createdAtMs) {
      return a.createdAtMs - b.createdAtMs
    }
    return a.userId.localeCompare(b.userId)
  })

  const ranked = rows.map((entry, index) => ({
    ...entry,
    rank: index + 1,
  }))

  const yourEntry = ranked.find((entry) => entry.userId === current.user.id) ?? null
  const items = ranked.slice(0, limit).map((entry) => ({
    rank: entry.rank,
    userId: entry.userId,
    username: entry.username,
    displayName: entry.displayName,
    avatarUrl: entry.avatarUrl,
    gifts: Math.round(entry.gifts),
    tonBalance: entry.tonBalance.toFixed(2),
    starsBalance: entry.starsBalance.toFixed(2),
  }))

  return jsonUtf8({
    ok: true,
    leaderboard: {
      sortBy,
      totalPlayers: ranked.length,
      yourRank: yourEntry?.rank ?? null,
      yourEntry: yourEntry
        ? {
            rank: yourEntry.rank,
            userId: yourEntry.userId,
            username: yourEntry.username,
            displayName: yourEntry.displayName,
            avatarUrl: yourEntry.avatarUrl,
            gifts: Math.round(yourEntry.gifts),
            tonBalance: yourEntry.tonBalance.toFixed(2),
            starsBalance: yourEntry.starsBalance.toFixed(2),
          }
        : null,
      items,
    },
  })
}
