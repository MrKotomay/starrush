import { getCurrentUser } from "@/lib/auth"
import { db } from "@/lib/db"
import { jsonUtf8 } from "@/lib/http"

export async function GET() {
  const current = await getCurrentUser()
  if (!current) {
    return jsonUtf8({ ok: false, error: "UNAUTHORIZED" }, { status: 401 })
  }

  const wallets = await db.wallet.findMany({
    where: { userId: current.user.id },
    orderBy: { currency: "asc" },
  })

  return jsonUtf8({
    ok: true,
    wallets: wallets.map((wallet) => ({
      id: wallet.id,
      currency: wallet.currency,
      balance: wallet.balance.toString(),
      lockedBalance: wallet.lockedBalance.toString(),
      updatedAt: wallet.updatedAt,
    })),
  })
}
