import crypto from "crypto"
import { Currency, LedgerType } from "@prisma/client"
import { Prisma } from "@prisma/client"
import { z } from "zod"
import { getCurrentUser } from "@/lib/auth"
import { db } from "@/lib/db"
import { jsonUtf8 } from "@/lib/http"
import { createTransaction, applyTransaction } from "@/lib/ledger.service"
import { rateLimit } from "@/lib/rate-limit"

const schema = z.object({
  currency: z.nativeEnum(Currency),
  amount: z.union([z.number().positive(), z.string().min(1)]),
})

function isDevWalletActionsEnabled() {
  return process.env.NODE_ENV === "development" && process.env.ENABLE_DEV_WALLET_ACTIONS === "1"
}

function parseAmount(value: string | number) {
  const amount = new Prisma.Decimal(value)
  if (!amount.isFinite() || amount.lte(0)) {
    throw new Error("INVALID_AMOUNT")
  }
  return amount
}

export async function POST(req: Request) {
  if (!isDevWalletActionsEnabled()) {
    return jsonUtf8({ ok: false, error: "DEV_WALLET_ACTIONS_DISABLED" }, { status: 403 })
  }

  const current = await getCurrentUser()
  if (!current) {
    return jsonUtf8({ ok: false, error: "UNAUTHORIZED" }, { status: 401 })
  }

  const rate = await rateLimit(`wallet:withdraw:${current.user.id}`, 10, 60)
  if (!rate.allowed) {
    return jsonUtf8({ ok: false, error: "RATE_LIMIT" }, { status: 429 })
  }

  const body = await req.json().catch(() => ({}))
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return jsonUtf8({ ok: false, error: "INVALID_INPUT" }, { status: 400 })
  }

  let amount: Prisma.Decimal
  try {
    amount = parseAmount(parsed.data.amount)
  } catch {
    return jsonUtf8({ ok: false, error: "INVALID_AMOUNT" }, { status: 400 })
  }

  try {
    const referenceId = `dev-withdraw:${current.user.id}:${parsed.data.currency}:${Date.now()}:${crypto
      .randomUUID()
      .slice(0, 8)}`

    const entry = await createTransaction({
      userId: current.user.id,
      currency: parsed.data.currency,
      amount: amount.mul(-1),
      type: LedgerType.WITHDRAW,
      referenceId,
      metadata: {
        source: "dev_wallet_actions",
        action: "withdraw",
      },
    })

    const applied = await applyTransaction(entry.id)
    const wallet = await db.wallet.findUnique({
      where: {
        userId_currency: {
          userId: current.user.id,
          currency: parsed.data.currency,
        },
      },
    })

    return jsonUtf8({
      ok: true,
      ledger: {
        id: applied.id,
        type: applied.type,
        status: applied.status,
        amount: applied.amount.toString(),
        currency: applied.currency,
        referenceId: applied.referenceId,
      },
      wallet: wallet
        ? {
            id: wallet.id,
            currency: wallet.currency,
            balance: wallet.balance.toString(),
            lockedBalance: wallet.lockedBalance.toString(),
          }
        : null,
    })
  } catch (error) {
    if (error instanceof Error && (error.message === "INSUFFICIENT_FUNDS" || error.message === "LOCKED_FUNDS_MISMATCH")) {
      return jsonUtf8({ ok: false, error: "INSUFFICIENT_BALANCE" }, { status: 402 })
    }
    console.error("[WalletWithdraw] Failed", error)
    return jsonUtf8({ ok: false, error: "WITHDRAW_FAILED" }, { status: 500 })
  }
}
