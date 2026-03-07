import { createAdminNonce, ADMIN_LOGIN_NONCE_COOKIE_NAME, ADMIN_LOGIN_NONCE_TTL_SECONDS } from "@/lib/admin"
import { jsonUtf8 } from "@/lib/http"
import { rateLimit } from "@/lib/rate-limit"

function secureCookie(expires: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.COOKIE_SECURE === "true" || process.env.NODE_ENV === "production",
    domain: process.env.COOKIE_DOMAIN || undefined,
    path: "/",
    expires,
  }
}

export async function GET(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  const limiter = await rateLimit(`admin:auth:nonce:${ip}`, 30, 60)
  if (!limiter.allowed) {
    return jsonUtf8({ ok: false, error: "RATE_LIMIT" }, { status: 429 })
  }

  const nonce = createAdminNonce()
  const response = jsonUtf8({ ok: true, nonce })
  response.cookies.set({
    name: ADMIN_LOGIN_NONCE_COOKIE_NAME,
    value: nonce,
    ...secureCookie(new Date(Date.now() + ADMIN_LOGIN_NONCE_TTL_SECONDS * 1000)),
  })
  return response
}
