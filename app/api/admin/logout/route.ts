import { cookies } from "next/headers"
import { ADMIN_CSRF_COOKIE_NAME, buildDeleteCookieOptions } from "@/lib/admin"
import { requireAdminWrite } from "@/lib/admin-request"
import { jsonUtf8 } from "@/lib/http"
import { revokeSession, SESSION_COOKIE_NAME } from "@/lib/session"

export async function POST(req: Request) {
  const access = await requireAdminWrite(req, "admin:logout", { max: 10, windowSeconds: 60 })
  if (!access.ok) {
    return access.response
  }

  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value
  if (token) {
    await revokeSession(token).catch(() => null)
  }

  const response = jsonUtf8({ ok: true })
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    ...buildDeleteCookieOptions(),
  })
  response.cookies.set({
    name: ADMIN_CSRF_COOKIE_NAME,
    value: "",
    ...buildDeleteCookieOptions(),
  })
  return response
}
