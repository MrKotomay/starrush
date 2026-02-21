type FundCurrency = "TON" | "STARS"

type CliArgs = {
  currency: FundCurrency
  amount: string
  baseUrl: string
  internalKey: string
}

function parseArgValue(flag: string, args: string[]) {
  const index = args.indexOf(flag)
  if (index === -1) return undefined
  return args[index + 1]
}

function parseArgs(argv: string[]): CliArgs {
  const currencyRaw = parseArgValue("--currency", argv)
  const amountRaw = parseArgValue("--amount", argv)
  const baseUrl = parseArgValue("--base-url", argv) ?? process.env.APP_BASE_URL ?? "http://localhost:3000"
  const internalKey = parseArgValue("--internal-key", argv) ?? process.env.INTERNAL_API_KEY ?? ""

  if (currencyRaw !== "TON" && currencyRaw !== "STARS") {
    throw new Error("Usage: npm run house:fund -- --currency TON|STARS --amount <value> [--base-url http://localhost:3000]")
  }

  if (!amountRaw) {
    throw new Error("Missing --amount")
  }

  if (!internalKey) {
    throw new Error("INTERNAL_API_KEY is required (env or --internal-key)")
  }

  return {
    currency: currencyRaw,
    amount: amountRaw,
    baseUrl,
    internalKey,
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const endpoint = `${args.baseUrl.replace(/\/$/, "")}/api/dev/treasury/fund`

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-key": args.internalKey,
      accept: "application/json",
    },
    body: JSON.stringify({
      currency: args.currency,
      amount: args.amount,
    }),
  })

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>

  if (!response.ok) {
    console.error("House fund failed", {
      status: response.status,
      payload,
    })
    process.exit(1)
  }

  console.log(JSON.stringify(payload, null, 2))
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown error"
  console.error(message)
  process.exit(1)
})
