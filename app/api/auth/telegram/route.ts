import { z } from "zod"
import { extractTelegramUserFromInitData, verifyTelegramWebAppInitData } from "@/lib/telegram-auth"
import { db } from "@/lib/db"
import { createSession, SESSION_COOKIE_NAME } from "@/lib/session"
import { rateLimit } from "@/lib/rate-limit"
import { jsonUtf8 } from "@/lib/http"
import { parseReferralStartParam } from "@/lib/referrals"

const MAX_AUTH_AGE_SECONDS = 60 * 60 * 24 // 24h

const schema = z.object({
  initData: z.string().min(1),
  startParam: z.string().min(1).max(128).optional(),
})

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return jsonUtf8({ ok: false, error: "MISSING_INIT_DATA" }, { status: 400 })
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  const rate = await rateLimit(`auth:telegram:${ip}`, 30, 60)
  if (!rate.allowed) {
    return jsonUtf8({ ok: false, error: "RATE_LIMIT" }, { status: 429 })
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN
  if (!botToken) {
    return jsonUtf8({ ok: false, error: "SERVER_NOT_CONFIGURED" }, { status: 500 })
  }

  const initData = parsed.data.initData
  const isValid = verifyTelegramWebAppInitData(initData, botToken)
  if (!isValid) {
    return jsonUtf8({ ok: false, error: "INVALID_INIT_DATA" }, { status: 401 })
  }

  const { user, authDate, queryId, startParam: startParamFromInitData } = extractTelegramUserFromInitData(initData)
  const startParam = startParamFromInitData ?? parsed.data.startParam

  if (authDate && Math.floor(Date.now() / 1000) - authDate > MAX_AUTH_AGE_SECONDS) {
    return jsonUtf8({ ok: false, error: "INIT_DATA_EXPIRED" }, { status: 401 })
  }

  if (!user?.id) {
    return jsonUtf8({ ok: false, error: "MISSING_USER" }, { status: 400 })
  }

  const telegramId = BigInt(user.id)
  const referralCandidateId = parseReferralStartParam(startParam)
  let referredById: string | null = null

  if (referralCandidateId) {
    const referrer = await db.user.findUnique({
      where: { id: referralCandidateId },
      select: { id: true, telegramId: true },
    })
    if (referrer && referrer.telegramId !== telegramId) {
      referredById = referrer.id
    }
  }

  const savedUser = await db.user.upsert({
    where: { telegramId },
    create: {
      telegramId,
      username: user.username || null,
      firstName: user.first_name || null,
      lastName: user.last_name || null,
      photoUrl: user.photo_url || null,
      languageCode: user.language_code || null,
      isBot: user.is_bot ?? false,
      referredById,
    },
    update: {
      username: user.username || null,
      firstName: user.first_name || null,
      lastName: user.last_name || null,
      photoUrl: user.photo_url || null,
      languageCode: user.language_code || null,
      isBot: user.is_bot ?? false,
    },
  })

  const [walletTon, walletStars] = await Promise.all([
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

  let session
  try {
    session = await createSession(savedUser.id)
  } catch {
    return jsonUtf8({ ok: false, error: "SESSION_NOT_CONFIGURED" }, { status: 500 })
  }

  const response = jsonUtf8({
    ok: true,
    user,
    dbUser: {
      id: savedUser.id,
      telegramId: savedUser.telegramId.toString(),
    },
    wallets: [walletTon, walletStars].map((wallet) => ({
      id: wallet.id,
      currency: wallet.currency,
      balance: wallet.balance.toString(),
      lockedBalance: wallet.lockedBalance.toString(),
    })),
    auth_date: authDate,
    query_id: queryId,
  })

  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: session.token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true" || process.env.NODE_ENV === "production",
    domain: process.env.COOKIE_DOMAIN || undefined,
    path: "/",
    expires: session.expiresAt,
  })

  return response
}
