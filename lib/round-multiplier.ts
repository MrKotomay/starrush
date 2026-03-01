import { gameConfig } from "@/lib/game-config"

export const ROUND_MULTIPLIER_SCALE = 4

export function computeRoundMultiplier(
  elapsedSeconds: number,
  growthRate = gameConfig.roundGrowthRate,
) {
  const safeElapsedSeconds = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0
  const rawMultiplier = Math.exp(growthRate * safeElapsedSeconds)
  return Math.max(1, Number(rawMultiplier.toFixed(ROUND_MULTIPLIER_SCALE)))
}
