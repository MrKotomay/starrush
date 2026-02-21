import crypto from "crypto"

type ParsedInitData = Record<string, string>

function safeTimingEqualHex(aHex: string, bHex: string): boolean {
  try {
    const a = Buffer.from(aHex, "hex")
    const b = Buffer.from(bHex, "hex")
    if (a.length !== b.length) return false
    return crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function parseTelegramInitData(initData: string): ParsedInitData {
  const params = new URLSearchParams(initData)
  const parsed: ParsedInitData = {}

  for (const [key, value] of params.entries()) {
    parsed[key] = value
  }

  return parsed
}

/**
 * Verifies Telegram Mini App (WebApp) initData signature.
 *
 * Spec:
 * - Remove `hash` from initData params
 * - Sort key=value pairs lexicographically by key
 * - data_check_string = pairs joined by "\n"
 * - secret_key = HMAC_SHA256("WebAppData", bot_token)
 * - computed_hash = HMAC_SHA256(secret_key, data_check_string) as hex
 */
export function verifyTelegramWebAppInitData(initData: string, botToken: string): boolean {
  const params = new URLSearchParams(initData)
  const hash = params.get("hash")
  if (!hash) return false

  params.delete("hash")

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n")

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest()
  const computedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex")

  return safeTimingEqualHex(computedHash, hash)
}

export type TelegramWebAppUser = {
  id: number
  is_bot?: boolean
  first_name?: string
  last_name?: string
  username?: string
  language_code?: string
  photo_url?: string
}

export function extractTelegramUserFromInitData(initData: string): {
  user?: TelegramWebAppUser
  authDate?: number
  queryId?: string
  startParam?: string
} {
  const parsed = parseTelegramInitData(initData)

  const authDateRaw = parsed.auth_date
  const authDate = authDateRaw ? Number(authDateRaw) : undefined

  const queryId = parsed.query_id
  const startParam = parsed.start_param

  let user: TelegramWebAppUser | undefined
  if (parsed.user) {
    try {
      user = JSON.parse(parsed.user) as TelegramWebAppUser
    } catch {
      user = undefined
    }
  }

  return { user, authDate, queryId, startParam }
}
