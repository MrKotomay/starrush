import { getCurrentUser } from "@/lib/auth"
import { db } from "@/lib/db"
import { jsonUtf8 } from "@/lib/http"

export async function GET() {
  const current = await getCurrentUser()
  if (!current) {
    return jsonUtf8({ ok: false, error: "UNAUTHORIZED" }, { status: 401 })
  }

  const wallets = await db.wallet.findMany({ where: { userId: current.user.id } })

  const balances = wallets.reduce<Record<string, string>>((acc, wallet) => {
    acc[wallet.currency] = wallet.balance.toString()
    return acc
  }, {})

  return jsonUtf8({ ok: true, balances })
}
