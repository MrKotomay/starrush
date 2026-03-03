import { db } from "@/lib/db"
import { createSession, SESSION_COOKIE_NAME } from "@/lib/session"
import { jsonUtf8 } from "@/lib/http"
import { isEnabledByEnvWithDevDefault, parseBooleanEnv } from "@/lib/dev-flags"

const DEV_TELEGRAM_ID = BigInt(123456789)
const DEV_USERNAME = "dev_user"

function isDevAuthEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false
  return isEnabledByEnvWithDevDefault(process.env.DEV_AUTH_ENABLED)
}

export async function POST() {
  if (!isDevAuthEnabled()) {
    return jsonUtf8(
      { ok: false, error: "DEV_AUTH_DISABLED" },
      { status: 403 }
    )
  }

  const savedUser = await db.user.upsert({
    where: { telegramId: DEV_TELEGRAM_ID },
    create: {
      telegramId: DEV_TELEGRAM_ID,
      username: DEV_USERNAME,
      firstName: "Dev",
      lastName: "User",
      photoUrl: null,
      languageCode: "en",
      isBot: false,
    },
    update: {},
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
    return jsonUtf8(
      { ok: false, error: "SESSION_NOT_CONFIGURED" },
      { status: 500 }
    )
  }

  const response = jsonUtf8({
    ok: true,
    user: {
      id: Number(savedUser.telegramId),
      username: savedUser.username,
      first_name: savedUser.firstName,
      last_name: savedUser.lastName,
      photo_url: savedUser.photoUrl,
      language_code: savedUser.languageCode,
    },
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

export async function GET() {
  return jsonUtf8({
    enabled: isDevAuthEnabled(),
    env: process.env.NODE_ENV,
    devAuthEnabledRaw: process.env.DEV_AUTH_ENABLED ?? null,
    devAuthEnabledParsed: parseBooleanEnv(process.env.DEV_AUTH_ENABLED),
  })
}
