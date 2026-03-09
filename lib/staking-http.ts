import { jsonUtf8 } from "@/lib/http"
import { StakingError } from "@/services/staking.service"

const CONFLICT_CODES = new Set([
  "POOL_DISABLED",
  "INSUFFICIENT_BALANCE",
  "REWARD_RESERVE_EXHAUSTED",
  "PENDING_UNSTAKE_EXISTS",
  "INSUFFICIENT_STAKED_BALANCE",
  "REWARD_RESERVE_UNDERFLOW",
])

const NOT_FOUND_CODES = new Set(["POOL_NOT_FOUND"])

export function stakingErrorResponse(error: unknown) {
  if (error instanceof StakingError) {
    if (NOT_FOUND_CODES.has(error.code)) {
      return jsonUtf8({ ok: false, error: error.code }, { status: 404 })
    }
    if (CONFLICT_CODES.has(error.code)) {
      return jsonUtf8({ ok: false, error: error.code }, { status: 409 })
    }
    return jsonUtf8({ ok: false, error: error.code }, { status: 400 })
  }

  return null
}
