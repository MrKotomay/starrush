import crypto from "crypto"
import { db } from "@/lib/db"
import { redis } from "@/lib/redis"

const SESSION_COOKIE_NAME = "sr_session"
const SESSION_TTL_DAYS = 30
const SESSION_REFRESH_DAYS = 7

type SessionCache = {
  userId: string
  expiresAt: string
  revokedAt?: string | null
}

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error("SESSION_SECRET is not set")
  return secret
}

function hashToken(token: string): string {
  return crypto.createHmac("sha256", getSessionSecret()).update(token).digest("hex")
}

function getSessionTtlSeconds(expiresAt: Date): number {
  const ttl = Math.floor((expiresAt.getTime() - Date.now()) / 1000)
  return Math.max(ttl, 0)
}

async function cacheSession(tokenHash: string, session: SessionCache) {
  if (!redis) return
  const ttl = getSessionTtlSeconds(new Date(session.expiresAt))
  if (ttl <= 0) return
  try {
    await redis.set(`session:${tokenHash}`, JSON.stringify(session), "EX", ttl)
  } catch {
    // ignore redis errors
  }
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = crypto.randomBytes(32).toString("hex")
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000)

  await db.session.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
    },
  })

  await cacheSession(tokenHash, { userId, expiresAt: expiresAt.toISOString() })

  return { token, expiresAt }
}

export async function getSession(token: string) {
  const tokenHash = hashToken(token)

  if (redis) {
    try {
      const cached = await redis.get(`session:${tokenHash}`)
      if (cached) {
        const parsed = JSON.parse(cached) as SessionCache
        const expiresAt = new Date(parsed.expiresAt)
        if (parsed.revokedAt || expiresAt.getTime() <= Date.now()) return null
        return { tokenHash, userId: parsed.userId, expiresAt }
      }
    } catch {
      // ignore redis errors
    }
  }

  const session = await db.session.findUnique({ where: { tokenHash } })
  if (!session) return null
  if (session.revokedAt || session.expiresAt.getTime() <= Date.now()) return null

  const revokedAt = (session as { revokedAt?: Date | null }).revokedAt
  await cacheSession(tokenHash, {
    userId: session.userId,
    expiresAt: session.expiresAt.toISOString(),
    revokedAt: revokedAt ? revokedAt.toISOString() : null,
  })

  if (shouldRefreshSession(session.expiresAt)) {
    await refreshSession(tokenHash)
  }

  return { tokenHash, userId: session.userId, expiresAt: session.expiresAt }
}

function shouldRefreshSession(expiresAt: Date): boolean {
  const refreshAt = Date.now() + SESSION_REFRESH_DAYS * 24 * 60 * 60 * 1000
  return expiresAt.getTime() < refreshAt
}

export async function refreshSession(tokenHash: string) {
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000)
  const session = await db.session.update({
    where: { tokenHash },
    data: { expiresAt, lastSeenAt: new Date() },
  })

  const revokedAt = (session as { revokedAt?: Date | null }).revokedAt
  await cacheSession(tokenHash, {
    userId: session.userId,
    expiresAt: session.expiresAt.toISOString(),
    revokedAt: revokedAt ? revokedAt.toISOString() : null,
  })

  return session
}

export async function revokeSession(token: string) {
  const tokenHash = hashToken(token)
  const session = await db.session.update({
    where: { tokenHash },
    data: { revokedAt: new Date() },
  })
  if (redis) {
    try {
      await redis.del(`session:${tokenHash}`)
    } catch {
      // ignore redis errors
    }
  }
  return session
}

export { SESSION_COOKIE_NAME, hashToken }
