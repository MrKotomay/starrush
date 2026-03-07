import crypto from "crypto"
import { cookies } from "next/headers"
import { getCurrentUser } from "@/lib/auth"
import { SESSION_COOKIE_NAME } from "@/lib/session"

export const ADMIN_CSRF_COOKIE_NAME = "sr_admin_csrf"
export const ADMIN_LOGIN_NONCE_COOKIE_NAME = "sr_admin_login_nonce"
export const ADMIN_LOGIN_NONCE_TTL_SECONDS = 10 * 60
export const ADMIN_CSRF_TTL_SECONDS = 12 * 60 * 60

function splitEnvList(input: string | undefined) {
  return (input ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
}

export function getAdminTelegramIds() {
  return new Set(splitEnvList(process.env.ADMIN_TELEGRAM_IDS))
}

export function isAdminTelegramId(telegramId: string | bigint | number) {
  return getAdminTelegramIds().has(String(telegramId))
}

export function getAdminLoginClientId() {
  return process.env.TELEGRAM_LOGIN_CLIENT_ID ?? ""
}

function setUrlSearchParams(url: URL, entries: Array<[string, string]>) {
  const search = entries
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&")

  url.search = search ? `?${search}` : ""
}

function normalizeAdminStudioDatabaseUrl(databaseUrl: string) {
  if (!databaseUrl) {
    return ""
  }

  try {
    const url = new URL(databaseUrl)
    const schema = url.searchParams.get("schema")?.trim()
    if (!schema) {
      return databaseUrl
    }

    const params = Array.from(url.searchParams.entries()).filter(([key]) => key !== "schema")

    if (schema !== "public") {
      const searchPathOption = `-csearch_path=${schema}`
      const existingOptionsIndex = params.findIndex(([key]) => key === "options")

      if (existingOptionsIndex === -1) {
        params.push(["options", searchPathOption])
      } else if (!params[existingOptionsIndex][1].includes("search_path")) {
        params[existingOptionsIndex] = [
          "options",
          `${params[existingOptionsIndex][1]} ${searchPathOption}`.trim(),
        ]
      }
    }

    setUrlSearchParams(url, params)
    return url.toString()
  } catch {
    return databaseUrl
  }
}

export function getAdminStudioDatabaseUrl() {
  const rawDatabaseUrl =
    process.env.ADMIN_STUDIO_DATABASE_URL ||
    process.env.DATABASE_URL ||
    process.env.DOCKER_DATABASE_URL ||
    ""

  // Prisma uses `schema=` in DATABASE_URL, but postgres.js expects a standard
  // Postgres startup option such as `options=-csearch_path=...`.
  return normalizeAdminStudioDatabaseUrl(rawDatabaseUrl)
}

export function getGatewayInternalBaseUrl() {
  return process.env.GATEWAY_INTERNAL_BASE_URL ?? "http://gateway:8081"
}

export function getWorkerInternalBaseUrl() {
  return process.env.WORKER_INTERNAL_BASE_URL ?? "http://worker:8082"
}

export function getAppInternalBaseUrl() {
  return process.env.APP_INTERNAL_BASE_URL ?? "http://app:3000"
}

export function createAdminNonce() {
  return crypto.randomBytes(18).toString("hex")
}

export function createAdminCsrfToken() {
  return crypto.randomBytes(24).toString("hex")
}

export async function getAdminAccessState() {
  const current = await getCurrentUser()
  if (!current) {
    return { kind: "unauthenticated" as const }
  }

  if (!isAdminTelegramId(current.user.telegramId)) {
    return { kind: "forbidden" as const, current }
  }

  return { kind: "admin" as const, current }
}

export async function getCurrentAdmin() {
  const access = await getAdminAccessState()
  return access.kind === "admin" ? access.current : null
}

export async function requireAdmin() {
  const access = await getAdminAccessState()
  if (access.kind === "unauthenticated") {
    throw new Error("UNAUTHORIZED")
  }
  if (access.kind === "forbidden") {
    throw new Error("FORBIDDEN")
  }
  return access.current
}

export async function getAdminCsrfToken() {
  const cookieStore = await cookies()
  return cookieStore.get(ADMIN_CSRF_COOKIE_NAME)?.value ?? null
}

export function buildSecureCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.COOKIE_SECURE === "true" || process.env.NODE_ENV === "production",
    domain: process.env.COOKIE_DOMAIN || undefined,
    path: "/",
    expires,
  }
}

export function buildDeleteCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.COOKIE_SECURE === "true" || process.env.NODE_ENV === "production",
    domain: process.env.COOKIE_DOMAIN || undefined,
    path: "/",
    expires: new Date(0),
  }
}

export function getSessionCookieName() {
  return SESSION_COOKIE_NAME
}
