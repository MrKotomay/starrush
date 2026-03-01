import { z } from "zod"

const decimalStringSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?$/, "must be a non-negative decimal string")

const envSchema = z.object({
  GAME_HOUSE_EDGE: z.coerce.number().gt(0).lt(1).default(0.01),
  GAME_MAX_CRASH: z.coerce.number().min(1.01).default(1000),
  RISK_MAX_PAYOUT_FRACTION_PER_BET: z.coerce.number().gt(0).lte(1).default(0.02),
  RISK_MAX_EXPOSURE_FRACTION_PER_ROUND: z.coerce.number().gt(0).lte(1).default(0.1),
  ROUND_GROWTH_RATE: z.coerce.number().gt(0).lte(1).default(0.09),
  HOUSE_BANKROLL_INITIAL_TON: decimalStringSchema.default("0"),
  HOUSE_BANKROLL_INITIAL_STARS: decimalStringSchema.default("0"),
})

export function loadGameConfig(source: Record<string, string | undefined> = process.env) {
  const parsed = envSchema.safeParse(source)

  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")
    throw new Error(`Invalid game config env: ${details}`)
  }

  const env = parsed.data

  return {
    houseEdge: env.GAME_HOUSE_EDGE,
    maxCrash: env.GAME_MAX_CRASH,
    riskMaxPayoutFractionPerBet: env.RISK_MAX_PAYOUT_FRACTION_PER_BET,
    riskMaxExposureFractionPerRound: env.RISK_MAX_EXPOSURE_FRACTION_PER_ROUND,
    roundGrowthRate: env.ROUND_GROWTH_RATE,
    houseBankrollInitialTon: env.HOUSE_BANKROLL_INITIAL_TON,
    houseBankrollInitialStars: env.HOUSE_BANKROLL_INITIAL_STARS,
  }
}

export const gameConfig = Object.freeze(loadGameConfig())

export function getInitialHouseBankroll(currency: "TON" | "STARS") {
  return currency === "TON" ? gameConfig.houseBankrollInitialTon : gameConfig.houseBankrollInitialStars
}
