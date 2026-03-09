import { getCurrentUser } from "@/lib/auth"
import { jsonUtf8 } from "@/lib/http"
import { stakingErrorResponse } from "@/lib/staking-http"
import { getStakingOverview } from "@/services/staking.service"

export async function GET() {
  const current = await getCurrentUser()
  if (!current) {
    return jsonUtf8({ ok: false, error: "UNAUTHORIZED" }, { status: 401 })
  }

  try {
    const overview = await getStakingOverview(current.user.id)
    return jsonUtf8({ ok: true, ...overview })
  } catch (error) {
    const response = stakingErrorResponse(error)
    if (response) return response
    throw error
  }
}
