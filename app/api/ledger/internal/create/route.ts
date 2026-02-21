import { z } from "zod"
import { Prisma, LedgerType, LedgerStatus, Currency } from "@prisma/client"
import { createTransaction, applyTransaction } from "@/lib/ledger.service"
import { rateLimit } from "@/lib/rate-limit"
import { jsonUtf8 } from "@/lib/http"
import { applyReferralRewardForDeposit } from "@/lib/referrals"

const schema = z.object({
  userId: z.string().min(1),
  currency: z.nativeEnum(Currency),
  amount: z.string().min(1),
  type: z.nativeEnum(LedgerType),
  referenceId: z.string().min(4),
  metadata: z.unknown().optional(),
  status: z.nativeEnum(LedgerStatus).optional(),
  lockFunds: z.boolean().optional(),
  autoApply: z.boolean().optional().default(true),
})

type Payload = z.infer<typeof schema>

export async function POST(req: Request) {
  const internalKey = req.headers.get("x-internal-key")
  if (!process.env.INTERNAL_API_KEY || internalKey !== process.env.INTERNAL_API_KEY) {
    return jsonUtf8({ ok: false, error: "FORBIDDEN" }, { status: 403 })
  }

  const rate = await rateLimit("ledger:internal", 30, 60)
  if (!rate.allowed) {
    return jsonUtf8({ ok: false, error: "RATE_LIMIT" }, { status: 429 })
  }

  const body = await req.json().catch(() => ({}))
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return jsonUtf8({ ok: false, error: "INVALID_INPUT" }, { status: 400 })
  }

  const data = parsed.data as Payload
  const amount = new Prisma.Decimal(data.amount)

  const entry = await createTransaction({
    userId: data.userId,
    currency: data.currency,
    amount,
    type: data.type,
    referenceId: data.referenceId,
    metadata: data.metadata as Prisma.InputJsonValue | undefined,
    status: data.status ?? LedgerStatus.PENDING,
    lockFunds: data.lockFunds ?? false,
  })

  const finalEntry = data.autoApply ? await applyTransaction(entry.id) : entry

  if (finalEntry.type === LedgerType.DEPOSIT && finalEntry.status === LedgerStatus.COMPLETED) {
    try {
      await applyReferralRewardForDeposit(finalEntry.id)
    } catch (referralError) {
      console.error("[LedgerInternalCreate] Referral reward apply failed", referralError)
    }
  }

  return jsonUtf8({
    ok: true,
    ledger: {
      id: finalEntry.id,
      status: finalEntry.status,
      amount: finalEntry.amount.toString(),
    },
  })
}
