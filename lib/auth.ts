import { cookies } from "next/headers"
import { db } from "@/lib/db"
import { getSession, SESSION_COOKIE_NAME } from "@/lib/session"

export type CurrentUser = {
  id: string
  telegramId: string
  username?: string | null
}

export async function getCurrentUser() {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value
  if (!token) return null

  const session = await getSession(token)
  if (!session) return null

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, telegramId: true, username: true },
  })
  if (!user) return null

  return {
    user,
    session,
  }
}

export async function requireAuth() {
  const current = await getCurrentUser()
  if (!current) {
    throw new Error("UNAUTHORIZED")
  }
  return current
}
