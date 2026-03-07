import { Currency } from "@prisma/client"
import { z } from "zod"
import { HouseInsufficientBankrollError } from "@/lib/house-ledger.service"
import { AdminActionError, adjustUserWallet } from "@/lib/admin-actions"
import { requireAdminWrite } from "@/lib/admin-request"
import { jsonUtf8 } from "@/lib/http"

const schema = z.object({
  userId: z.string().min(1),
  currency: z.nativeEnum(Currency),
  direction: z.enum(["credit", "debit"]),
  amount: z.union([z.string().min(1), z.number().positive()]),
  reason: z.string().trim().min(3).max(512),
  requestId: z.string().uuid(),
})

export async function POST(req: Request) {
  const access = await requireAdminWrite(req, "admin:wallet-adjustment", { max: 30, windowSeconds: 60 })
  if (!access.ok) {
    return access.response
  }

  const body = await req.json().catch(() => ({}))
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return jsonUtf8({ ok: false, error: "INVALID_INPUT" }, { status: 400 })
  }

  try {
    const result = await adjustUserWallet({
      actorUserId: access.context.current.user.id,
      userId: parsed.data.userId,
      currency: parsed.data.currency,
      direction: parsed.data.direction,
      amount: parsed.data.amount,
      reason: parsed.data.reason,
      requestId: parsed.data.requestId,
      ip: access.context.ip,
      userAgent: access.context.userAgent,
    })

    return jsonUtf8({
      ok: true,
      idempotent: result.idempotent,
      auditLogId: result.auditLog.id,
      wallet: "wallet" in result
        ? {
            id: result.wallet.id,
            currency: result.wallet.currency,
            balance: result.wallet.balance.toString(),
            lockedBalance: result.wallet.lockedBalance.toString(),
          }
        : null,
    })
  } catch (error) {
    if (error instanceof HouseInsufficientBankrollError) {
      return jsonUtf8({ ok: false, error: error.code, details: error.details }, { status: 409 })
    }
    if (error instanceof AdminActionError) {
      const status =
        error.code === "WALLET_NOT_FOUND" ? 404 :
        error.code === "DUPLICATE_REQUEST" ? 409 :
        error.code === "INVALID_AMOUNT" ? 400 :
        error.code === "INSUFFICIENT_FUNDS" ? 409 :
        400
      return jsonUtf8({ ok: false, error: error.code }, { status })
    }
    if (error instanceof Error && (error.message === "INSUFFICIENT_FUNDS" || error.message === "LOCKED_FUNDS_MISMATCH")) {
      return jsonUtf8({ ok: false, error: "INSUFFICIENT_FUNDS" }, { status: 409 })
    }
    throw error
  }
}
