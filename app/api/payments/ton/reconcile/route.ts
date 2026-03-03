import { z } from "zod"
import crypto from "crypto"
import { jsonUtf8 } from "@/lib/http"
import { paymentsConfig } from "@/lib/payments/config"
import { listTonIntentsForReconcile } from "@/lib/payments/intents.service"
import { reconcileTonIntent } from "@/lib/payments/ton-reconcile.service"
import { createLogger } from "@/lib/logger"

const schema = z.object({
  limit: z.number().int().min(1).max(200).optional(),
})
const logger = createLogger("payments-ton-reconcile")

function safeCompareKeys(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

export async function POST(req: Request) {
  if (!paymentsConfig.enableTonConnectDeposits) {
    return jsonUtf8({ ok: false, error: "TON_DEPOSITS_DISABLED" }, { status: 403 })
  }

  const internalKey = req.headers.get("x-internal-key") ?? ""
  if (!process.env.INTERNAL_API_KEY || !safeCompareKeys(internalKey, process.env.INTERNAL_API_KEY)) {
    logger.warn("internal_route_rejected", {
      route: "/api/payments/ton/reconcile",
      reason: "FORBIDDEN",
    })
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
          logger.error("ton_intent_reconcile_failed", {
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
    logger.error("ton_reconcile_failed", { error })
    return jsonUtf8({ ok: false, error: "RECONCILE_FAILED" }, { status: 500 })
  }
}
