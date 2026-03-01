import {
  buildReferralLink,
  buildReferralStartParam,
  parseReferralStartParam,
  resolveReferralAssignment,
} from "../lib/referrals"

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message)
}

function withEnv<T>(key: string, value: string | undefined, fn: () => T): T {
  const previous = process.env[key]
  if (value === undefined) {
    delete process.env[key]
  } else {
    process.env[key] = value
  }

  try {
    return fn()
  } finally {
    if (previous === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = previous
    }
  }
}

function main() {
  const referrerUserId = "cm123referrer"
  const startParam = buildReferralStartParam(referrerUserId)

  expect(startParam === "ref_cm123referrer", "start param must use referral prefix")
  expect(parseReferralStartParam(startParam) === referrerUserId, "parser must restore referrer id")
  expect(parseReferralStartParam("ref_bad-id") === null, "parser must reject invalid id chars")
  expect(parseReferralStartParam("start_cm123referrer") === null, "parser must reject wrong prefix")

  withEnv("TELEGRAM_BOT_USERNAME", "@starrush_bot", () => {
    const link = buildReferralLink(referrerUserId)
    const url = new URL(link)

    expect(url.origin === "https://t.me", "referral link must target Telegram")
    expect(url.pathname === "/starrush_bot", "referral link must normalize bot username")
    expect(url.searchParams.get("startapp") === startParam, "referral link must use startapp for Mini App launch")
    expect(url.searchParams.get("start") === null, "referral link must not use bot-chat start param")
  })

  expect(
    resolveReferralAssignment(null, "referrer-a") === "referrer-a",
    "new referral candidate must be assigned when there is no existing referrer"
  )
  expect(
    resolveReferralAssignment("referrer-a", "referrer-b") === "referrer-a",
    "existing referrer must remain immutable"
  )
  expect(
    resolveReferralAssignment(null, null) === null,
    "missing referral candidate must keep null assignment"
  )

  console.log("[PASS] referrals unit test")
}

main()
