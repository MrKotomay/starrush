import { z } from "zod"

import { getCurrentUser } from "@/lib/auth"
import { jsonUtf8 } from "@/lib/http"
import { rateLimit } from "@/lib/rate-limit"
import { stakingErrorResponse } from "@/lib/staking-http"
import { claimAssetRewards } from "@/services/staking.service"

const bodySchema = z.object({
  assetId: z.enum(["TON", "STARS"]),
})

export async function POST(req: Request) {
  const current = await getCurrentUser()
  if (!current) {
    return jsonUtf8({ ok: false, error: "UNAUTHORIZED" }, { status: 401 })
  }

  const limiter = await rateLimit(`staking:claim:${current.user.id}`, 12, 30)
  if (!limiter.allowed) {
    return jsonUtf8({ ok: false, error: "RATE_LIMIT" }, { status: 429 })
  }

  const body = await req.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return jsonUtf8({ ok: false, error: "INVALID_INPUT" }, { status: 400 })
  }

  try {
    const result = await claimAssetRewards({
      userId: current.user.id,
      assetId: parsed.data.assetId,
    })

    return jsonUtf8({
      ok: true,
      claimedAmount: result.claimedAmount,
      asset: result.asset,
    })
  } catch (error) {
    const response = stakingErrorResponse(error)
    if (response) return response
    throw error
  }
}
