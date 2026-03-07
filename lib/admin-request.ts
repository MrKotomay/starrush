import { cookies } from "next/headers"
import { getAdminAccessState, ADMIN_CSRF_COOKIE_NAME } from "@/lib/admin"
import { jsonUtf8 } from "@/lib/http"
import { rateLimit } from "@/lib/rate-limit"

export type AdminRequestContext = {
  current: Exclude<Awaited<ReturnType<typeof getAdminAccessState>>, { kind: "unauthenticated" | "forbidden" }>["current"]
  ip: string
  userAgent: string | null
}

export function getRequestIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
}

export function getRequestUserAgent(req: Request) {
  return req.headers.get("user-agent")
}

function originMatchesRequest(req: Request) {
  const origin = req.headers.get("origin")
  if (!origin) return false

  try {
    return new URL(origin).origin === new URL(req.url).origin
  } catch {
    return false
  }
}

async function csrfMatches(req: Request) {
  const cookieStore = await cookies()
  const csrfCookie = cookieStore.get(ADMIN_CSRF_COOKIE_NAME)?.value
  const csrfHeader = req.headers.get("x-csrf-token")
  return Boolean(csrfCookie && csrfHeader && csrfCookie === csrfHeader)
}

export async function requireAdminRead() {
  const access = await getAdminAccessState()
  if (access.kind === "unauthenticated") {
    return { ok: false as const, response: jsonUtf8({ ok: false, error: "UNAUTHORIZED" }, { status: 401 }) }
  }
  if (access.kind === "forbidden") {
    return { ok: false as const, response: jsonUtf8({ ok: false, error: "FORBIDDEN" }, { status: 403 }) }
  }

  return {
    ok: true as const,
    context: {
      current: access.current,
      ip: "n/a",
      userAgent: null,
    },
  }
}

export async function requireAdminWrite(
  req: Request,
  rateKey: string,
  options?: { max?: number; windowSeconds?: number },
) {
  const access = await getAdminAccessState()
  if (access.kind === "unauthenticated") {
    return { ok: false as const, response: jsonUtf8({ ok: false, error: "UNAUTHORIZED" }, { status: 401 }) }
  }
  if (access.kind === "forbidden") {
    return { ok: false as const, response: jsonUtf8({ ok: false, error: "FORBIDDEN" }, { status: 403 }) }
  }

  if (!originMatchesRequest(req)) {
    return { ok: false as const, response: jsonUtf8({ ok: false, error: "INVALID_ORIGIN" }, { status: 403 }) }
  }

  if (!(await csrfMatches(req))) {
    return { ok: false as const, response: jsonUtf8({ ok: false, error: "INVALID_CSRF" }, { status: 403 }) }
  }

  const ip = getRequestIp(req)
  const userAgent = getRequestUserAgent(req)
  const limiter = await rateLimit(
    `${rateKey}:${access.current.user.id}:${ip}`,
    options?.max ?? 20,
    options?.windowSeconds ?? 60,
  )
  if (!limiter.allowed) {
    return { ok: false as const, response: jsonUtf8({ ok: false, error: "RATE_LIMIT" }, { status: 429 }) }
  }

  return {
    ok: true as const,
    context: {
      current: access.current,
      ip,
      userAgent,
    } satisfies AdminRequestContext,
  }
}
