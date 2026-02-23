import { z } from "zod"
import { jsonUtf8 } from "@/lib/http"
import { paymentsConfig } from "@/lib/payments/config"
import { listTonIntentsForReconcile } from "@/lib/payments/intents.service"
import { reconcileTonIntent } from "@/lib/payments/ton-reconcile.service"

const schema = z.object({
  limit: z.number().int().min(1).max(200).optional(),
})

export async function POST(req: Request) {
  if (!paymentsConfig.enableTonConnectDeposits) {
    return jsonUtf8({ ok: false, error: "TON_DEPOSITS_DISABLED" }, { status: 403 })
  }

  const internalKey = req.headers.get("x-internal-key")
  if (!process.env.INTERNAL_API_KEY || internalKey !== process.env.INTERNAL_API_KEY) {
    return jsonUtf8({ ok: false, error: "FORBIDDEN" }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const parsed = schema.safeParse(body)
  const limit = parsed.success ? parsed.data.limit ?? 50 : 50

  try {
    const intents = await listTonIntentsForReconcile(limit)
    const results = await Promise.all(
      intents.map(async (intent) => {
        try {
          return await reconcileTonIntent(intent.id)
        } catch (error) {
          console.error("[Payments][TonReconcile] Intent reconcile failed", {
            intentId: intent.id,
            error,
          })
          return {
            intentId: intent.id,
            status: intent.status,
            completed: false,
            reason: "RECONCILE_ERROR",
          }
        }
      })
    )

    const completed = results.filter((entry) => entry.completed).length
    const pending = results.filter((entry) => !entry.completed).length

    return jsonUtf8({
      ok: true,
      scanned: intents.length,
      completed,
      pending,
      results,
    })
  } catch (error) {
    console.error("[Payments][TonReconcile] Failed", error)
    return jsonUtf8({ ok: false, error: "RECONCILE_FAILED" }, { status: 500 })
  }
}
