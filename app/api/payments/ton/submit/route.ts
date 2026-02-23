import { Prisma } from "@prisma/client"
import { z } from "zod"
import { getCurrentUser } from "@/lib/auth"
import { db } from "@/lib/db"
import { jsonUtf8 } from "@/lib/http"
import { paymentsConfig } from "@/lib/payments/config"
import { getUserIntent, setTonIntentSubmission } from "@/lib/payments/intents.service"
import { deriveTxHashFromBoc } from "@/lib/payments/ton.service"
import { reconcileTonIntent } from "@/lib/payments/ton-reconcile.service"
import { rateLimit } from "@/lib/rate-limit"

const schema = z
  .object({
    intentId: z.string().min(1),
    txHash: z.string().min(16).max(256).optional(),
    boc: z.string().min(16).optional(),
  })
  .refine((data) => Boolean(data.txHash || data.boc), {
    message: "txHash or boc is required",
    path: ["txHash"],
  })

export async function POST(req: Request) {
  if (!paymentsConfig.enableTonConnectDeposits) {
    return jsonUtf8({ ok: false, error: "TON_DEPOSITS_DISABLED" }, { status: 403 })
  }

  const current = await getCurrentUser()
  if (!current) {
    return jsonUtf8({ ok: false, error: "UNAUTHORIZED" }, { status: 401 })
  }

  const rate = await rateLimit(
    `payments:ton:submit:${current.user.id}`,
    paymentsConfig.depositRateLimitMax,
    paymentsConfig.depositRateLimitWindowSeconds
  )

  if (!rate.allowed) {
    return jsonUtf8({ ok: false, error: "RATE_LIMIT" }, { status: 429 })
  }

  const body = await req.json().catch(() => ({}))
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return jsonUtf8({ ok: false, error: "INVALID_INPUT" }, { status: 400 })
  }

  const input = parsed.data

  const intent = await getUserIntent({
    userId: current.user.id,
    intentId: input.intentId,
  })

  if (!intent) {
    return jsonUtf8({ ok: false, error: "INTENT_NOT_FOUND" }, { status: 404 })
  }

  if (intent.status === "COMPLETED") {
    return jsonUtf8({
      ok: true,
      intent: {
        id: intent.id,
        status: intent.status,
        txHash: intent.txHash,
      },
      reconcile: {
        intentId: intent.id,
        status: intent.status,
        completed: true,
        reason: "ALREADY_COMPLETED",
      },
    })
  }

  if (intent.status === "FAILED" || intent.status === "EXPIRED" || intent.status === "CANCELED") {
    return jsonUtf8({ ok: false, error: "INTENT_NOT_PAYABLE" }, { status: 409 })
  }

  try {
    const txHash = (input.txHash ?? deriveTxHashFromBoc(input.boc as string)).trim().toLowerCase()

    await setTonIntentSubmission({
      intentId: intent.id,
      txHash,
      txBoc: input.boc ?? null,
    })

    const reconcile = await reconcileTonIntent(intent.id)

    const latest = await db.depositIntent.findUnique({ where: { id: intent.id } })

    return jsonUtf8({
      ok: true,
      intent: latest
        ? {
            id: latest.id,
            status: latest.status,
            txHash: latest.txHash,
          }
        : {
            id: intent.id,
            status: reconcile.status,
            txHash,
          },
      reconcile,
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return jsonUtf8({ ok: false, error: "TX_ALREADY_USED" }, { status: 409 })
    }

    console.error("[Payments][TonSubmit] Failed", error)
    return jsonUtf8({ ok: false, error: "TON_SUBMIT_FAILED" }, { status: 500 })
  }
}
