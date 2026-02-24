import { Currency, Prisma, type HouseLedgerType } from "@prisma/client"
import { z } from "zod"
import { creditHouse } from "@/lib/house-ledger.service"
import { jsonUtf8 } from "@/lib/http"
import { rateLimit } from "@/lib/rate-limit"
import { isEnabledByEnvWithDevDefault } from "@/lib/dev-flags"

const DEV_TREASURY_MAX_AMOUNT = new Prisma.Decimal("1000000")

const schema = z.object({
  currency: z.nativeEnum(Currency),
  amount: z.union([z.string().trim().min(1), z.number().finite()]),
})

function isDevTreasuryEnabled() {
  return isEnabledByEnvWithDevDefault(process.env.ENABLE_DEV_TREASURY)
}

function parseFundAmount(value: string | number) {
  const amount = new Prisma.Decimal(value)
  if (amount.lte(0)) {
    throw new Error("INVALID_AMOUNT")
  }
  if (amount.gt(DEV_TREASURY_MAX_AMOUNT)) {
    throw new Error("AMOUNT_TOO_LARGE")
  }
  return amount
}

export async function POST(req: Request) {
  if (!isDevTreasuryEnabled()) {
    return jsonUtf8({ ok: false, error: "DEV_TREASURY_DISABLED" }, { status: 403 })
  }

  const internalKey = req.headers.get("x-internal-key")
  if (!process.env.INTERNAL_API_KEY || internalKey !== process.env.INTERNAL_API_KEY) {
    return jsonUtf8({ ok: false, error: "FORBIDDEN" }, { status: 403 })
  }

  const rate = await rateLimit("dev:treasury:fund", 20, 60)
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
    amount = parseFundAmount(parsed.data.amount)
  } catch (error) {
    if (error instanceof Error && error.message === "AMOUNT_TOO_LARGE") {
      return jsonUtf8(
        {
          ok: false,
          error: "AMOUNT_TOO_LARGE",
          maxAmount: DEV_TREASURY_MAX_AMOUNT.toString(),
        },
        { status: 400 }
      )
    }
    return jsonUtf8({ ok: false, error: "INVALID_AMOUNT" }, { status: 400 })
  }

  const result = await creditHouse({
    currency: parsed.data.currency,
    amount,
    type: "HOUSE_FUND" as HouseLedgerType,
    metadata: {
      source: "dev_treasury_fund_api",
      requestedAmount: amount.toString(),
      fundedAt: new Date().toISOString(),
    },
  })

  return jsonUtf8({
    ok: true,
    wallet: {
      currency: result.wallet.currency,
      balance: result.wallet.balance.toString(),
    },
    ledger: {
      id: result.ledgerEntry.id,
      amount: result.ledgerEntry.amount.toString(),
      type: result.ledgerEntry.type,
      createdAt: result.ledgerEntry.createdAt.toISOString(),
    },
  })
}
