import { z } from "zod"

const decimalStringSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?$/, "must be a non-negative decimal string")

const envSchema = z.object({
  ENABLE_STARS_PAYMENTS: z.string().optional().default("0"),
  ENABLE_TONCONNECT_DEPOSITS: z.string().optional().default("0"),
  ENABLE_GIFTS_STUB: z.string().optional().default("0"),
  PAYMENTS_SIGNING_SECRET: z.string().optional().default(""),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional().default(""),
  DEPOSIT_TTL_SECONDS: z.coerce.number().int().min(60).default(15 * 60),
  DEPOSIT_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(20),
  DEPOSIT_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).default(60),
  DEPOSIT_LIMITS_STARS_MIN: z.coerce.number().int().min(1).default(1),
  DEPOSIT_LIMITS_STARS_MAX: z.coerce.number().int().min(1).default(50000),
  DEPOSIT_LIMITS_TON_MIN: decimalStringSchema.default("0.05"),
  DEPOSIT_LIMITS_TON_MAX: decimalStringSchema.default("500"),
  TON_CONFIRMATIONS_REQUIRED: z.coerce.number().int().min(1).default(1),
  TONAPI_KEY: z.string().optional().default(""),
  TON_DEPOSIT_ADDRESS: z.string().trim().optional().default(""),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")
  throw new Error(`Invalid payments config env: ${details}`)
}

const env = parsed.data

function parseBool(raw: string) {
  const value = raw.trim().toLowerCase()
  return value === "1" || value === "true" || value === "yes" || value === "on"
}

export const paymentsConfig = Object.freeze({
  enableStarsPayments: parseBool(env.ENABLE_STARS_PAYMENTS),
  enableTonConnectDeposits: parseBool(env.ENABLE_TONCONNECT_DEPOSITS),
  enableGiftsStub: parseBool(env.ENABLE_GIFTS_STUB),
  paymentsSigningSecret: env.PAYMENTS_SIGNING_SECRET,
  telegramWebhookSecret: env.TELEGRAM_WEBHOOK_SECRET,
  depositTtlSeconds: env.DEPOSIT_TTL_SECONDS,
  depositRateLimitMax: env.DEPOSIT_RATE_LIMIT_MAX,
  depositRateLimitWindowSeconds: env.DEPOSIT_RATE_LIMIT_WINDOW_SECONDS,
  depositLimitsStarsMin: env.DEPOSIT_LIMITS_STARS_MIN,
  depositLimitsStarsMax: env.DEPOSIT_LIMITS_STARS_MAX,
  depositLimitsTonMin: env.DEPOSIT_LIMITS_TON_MIN,
  depositLimitsTonMax: env.DEPOSIT_LIMITS_TON_MAX,
  tonConfirmationsRequired: env.TON_CONFIRMATIONS_REQUIRED,
  tonApiKey: env.TONAPI_KEY,
  tonDepositAddress: env.TON_DEPOSIT_ADDRESS,
})

export function assertPaymentsSigningSecret() {
  if (!paymentsConfig.paymentsSigningSecret) {
    throw new Error("PAYMENTS_SIGNING_SECRET_NOT_CONFIGURED")
  }
  return paymentsConfig.paymentsSigningSecret
}

export function assertTelegramWebhookSecret() {
  if (!paymentsConfig.telegramWebhookSecret) {
    throw new Error("TELEGRAM_WEBHOOK_SECRET_NOT_CONFIGURED")
  }
  return paymentsConfig.telegramWebhookSecret
}

export function assertTonApiKey() {
  if (!paymentsConfig.tonApiKey) {
    throw new Error("TONAPI_KEY_NOT_CONFIGURED")
  }
  return paymentsConfig.tonApiKey
}

export function assertTonDepositAddress() {
  const address = paymentsConfig.tonDepositAddress.trim()
  if (!address) {
    throw new Error("TON_DEPOSIT_ADDRESS_NOT_CONFIGURED")
  }
  return address
}
