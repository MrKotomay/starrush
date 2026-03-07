import { z } from "zod"
import { cookies } from "next/headers"
import { db } from "@/lib/db"
import {
  ADMIN_CSRF_COOKIE_NAME,
  ADMIN_CSRF_TTL_SECONDS,
  ADMIN_LOGIN_NONCE_COOKIE_NAME,
  buildDeleteCookieOptions,
  buildSecureCookieOptions,
  createAdminCsrfToken,
  getAdminLoginClientId,
  isAdminTelegramId,
} from "@/lib/admin"
import { originMatchesRequest } from "@/lib/admin-request"
import { jsonUtf8 } from "@/lib/http"
import { createSession, SESSION_COOKIE_NAME } from "@/lib/session"
import { verifyTelegramIdToken } from "@/lib/telegram-login"
import { rateLimit } from "@/lib/rate-limit"

const schema = z.object({
  id_token: z.string().min(1),
})

export async function POST(req: Request) {
  if (!originMatchesRequest(req)) {
    return jsonUtf8({ ok: false, error: "INVALID_ORIGIN" }, { status: 403 })
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  const limiter = await rateLimit(`admin:auth:telegram:${ip}`, 20, 60)
  if (!limiter.allowed) {
    return jsonUtf8({ ok: false, error: "RATE_LIMIT" }, { status: 429 })
  }

  const nonceHeader = req.headers.get("x-admin-login-nonce")
  const cookieStore = await cookies()
  const nonceCookie = cookieStore.get(ADMIN_LOGIN_NONCE_COOKIE_NAME)?.value
  if (!nonceHeader || !nonceCookie || nonceHeader !== nonceCookie) {
    return jsonUtf8({ ok: false, error: "INVALID_NONCE" }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return jsonUtf8({ ok: false, error: "INVALID_INPUT" }, { status: 400 })
  }

  const clientId = getAdminLoginClientId()
  if (!clientId) {
    return jsonUtf8({ ok: false, error: "SERVER_NOT_CONFIGURED" }, { status: 500 })
  }

  let claims: Awaited<ReturnType<typeof verifyTelegramIdToken>>
  try {
    claims = await verifyTelegramIdToken({
      idToken: parsed.data.id_token,
      clientId,
      nonce: nonceCookie,
    })
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_NONCE") {
      return jsonUtf8({ ok: false, error: "INVALID_NONCE" }, { status: 401 })
    }
    return jsonUtf8({ ok: false, error: "INVALID_TELEGRAM_AUTH" }, { status: 401 })
  }

  const rawTelegramId = claims.id ?? claims.sub
  if (rawTelegramId === undefined || rawTelegramId === null) {
    return jsonUtf8({ ok: false, error: "INVALID_TELEGRAM_AUTH" }, { status: 401 })
  }

  let telegramId: bigint
  try {
    telegramId = BigInt(String(rawTelegramId))
  } catch {
    return jsonUtf8({ ok: false, error: "INVALID_TELEGRAM_AUTH" }, { status: 401 })
  }

  if (!isAdminTelegramId(telegramId)) {
    return jsonUtf8({ ok: false, error: "FORBIDDEN" }, { status: 403 })
  }

  const fullName = typeof claims.name === "string" ? claims.name.trim() : ""
  const nameParts = fullName ? fullName.split(/\s+/) : []
  const firstName = nameParts[0] || fullName || null
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : null
  const username = typeof claims.preferred_username === "string" ? claims.preferred_username : null
  const photoUrl = typeof claims.picture === "string" ? claims.picture : null

  const savedUser = await db.user.upsert({
    where: { telegramId },
    create: {
      telegramId,
      username,
      firstName,
      lastName,
      photoUrl,
    },
    update: {
      username,
      firstName,
      lastName,
      photoUrl,
    },
  })

  await Promise.all([
    db.wallet.upsert({
      where: { userId_currency: { userId: savedUser.id, currency: "TON" } },
      create: { userId: savedUser.id, currency: "TON" },
      update: {},
    }),
    db.wallet.upsert({
      where: { userId_currency: { userId: savedUser.id, currency: "STARS" } },
      create: { userId: savedUser.id, currency: "STARS" },
      update: {},
    }),
  ])

  const session = await createSession(savedUser.id)
  const csrfToken = createAdminCsrfToken()
  const response = jsonUtf8({
    ok: true,
    user: {
      id: savedUser.id,
      telegramId: savedUser.telegramId.toString(),
      username: savedUser.username,
    },
  })

  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: session.token,
    ...buildSecureCookieOptions(session.expiresAt),
  })
  response.cookies.set({
    name: ADMIN_CSRF_COOKIE_NAME,
    value: csrfToken,
    ...buildSecureCookieOptions(new Date(Date.now() + ADMIN_CSRF_TTL_SECONDS * 1000)),
  })
  response.cookies.set({
    name: ADMIN_LOGIN_NONCE_COOKIE_NAME,
    value: "",
    ...buildDeleteCookieOptions(),
  })

  return response
}
