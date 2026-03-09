import { z } from "zod"

import { getCurrentUser } from "@/lib/auth"
import { jsonUtf8 } from "@/lib/http"
import { rateLimit } from "@/lib/rate-limit"
import { stakingErrorResponse } from "@/lib/staking-http"
import { stakeAsset } from "@/services/staking.service"

const bodySchema = z.object({
  assetId: z.enum(["TON", "STARS"]),
  amount: z.union([z.number().finite(), z.string().trim().min(1)]),
})

export async function POST(req: Request) {
  const current = await getCurrentUser()
  if (!current) {
    return jsonUtf8({ ok: false, error: "UNAUTHORIZED" }, { status: 401 })
  }

  const limiter = await rateLimit(`staking:stake:${current.user.id}`, 12, 30)
  if (!limiter.allowed) {
    return jsonUtf8({ ok: false, error: "RATE_LIMIT" }, { status: 429 })
  }

  const body = await req.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return jsonUtf8({ ok: false, error: "INVALID_INPUT" }, { status: 400 })
  }

  try {
    const result = await stakeAsset({
      userId: current.user.id,
      assetId: parsed.data.assetId,
      amount: parsed.data.amount,
    })

    return jsonUtf8({
      ok: true,
      asset: result.asset,
    })
  } catch (error) {
    const response = stakingErrorResponse(error)
    if (response) return response
    throw error
  }
}
