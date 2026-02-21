import { IncomingMessage } from "http"
import { getSession, SESSION_COOKIE_NAME } from "@/lib/session"

function parseCookies(header?: string) {
  if (!header) return new Map<string, string>()
  const pairs = header.split(";")
  const map = new Map<string, string>()
  for (const pair of pairs) {
    const index = pair.indexOf("=")
    if (index === -1) continue
    const key = pair.slice(0, index).trim()
    const value = pair.slice(index + 1).trim()
    if (key) map.set(key, decodeURIComponent(value))
  }
  return map
}

export async function authenticateWs(req: IncomingMessage) {
  const cookies = parseCookies(req.headers.cookie)
  const token = cookies.get(SESSION_COOKIE_NAME)
  if (!token) return null

  const session = await getSession(token)
  if (!session) return null

  return { userId: session.userId }
}
