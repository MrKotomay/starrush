import { z } from "zod"
import { getCurrentUser } from "@/lib/auth"
import { db } from "@/lib/db"
import { jsonUtf8 } from "@/lib/http"

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export async function GET(req: Request) {
  const current = await getCurrentUser()
  if (!current) {
    return jsonUtf8({ ok: false, error: "UNAUTHORIZED" }, { status: 401 })
  }

  const url = new URL(req.url)
  const parsed = querySchema.safeParse({ limit: url.searchParams.get("limit") ?? undefined })
  const limit = parsed.success ? parsed.data.limit : 20

  const ledger = await db.ledgerEntry.findMany({
    where: { userId: current.user.id },
    orderBy: { createdAt: "desc" },
    take: limit,
  })

  return jsonUtf8({
    ok: true,
    ledger: ledger.map((entry) => ({
      id: entry.id,
      walletId: entry.walletId,
      currency: entry.currency,
      amount: entry.amount.toString(),
      type: entry.type,
      status: entry.status,
      referenceId: entry.referenceId,
      metadata: entry.metadata,
      createdAt: entry.createdAt,
    })),
  })
}
