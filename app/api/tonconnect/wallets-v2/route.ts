import { jsonUtf8 } from "@/lib/http"

export const dynamic = "force-dynamic"

type WalletsCacheEntry = {
  payloadText: string
  fetchedAt: number
  source: string
}

const FETCH_TIMEOUT_MS = 4500
const FRESH_TTL_MS = 5 * 60 * 1000
const STALE_TTL_MS = 24 * 60 * 60 * 1000
const DEFAULT_SOURCES = [
  "https://config.ton.org/wallets-v2.json",
  "https://raw.githubusercontent.com/ton-connect/wallets-list/main/wallets-v2.json",
  "https://cdn.jsdelivr.net/gh/ton-connect/wallets-list@main/wallets-v2.json",
]

let cache: WalletsCacheEntry | null = null

function resolveSources(): string[] {
  const envRaw = process.env.TONCONNECT_WALLETS_LIST_SOURCES?.trim()
  if (!envRaw) return DEFAULT_SOURCES

  return envRaw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
}

function toCachedResponse(entry: WalletsCacheEntry, stale: boolean) {
  return new Response(entry.payloadText, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": stale
        ? "public, max-age=30, stale-while-revalidate=600"
        : "public, max-age=300, stale-while-revalidate=3600",
      "X-Tonconnect-Wallets-Source": entry.source,
      "X-Tonconnect-Wallets-Cache": stale ? "stale" : "fresh",
    },
  })
}

async function fetchWalletsList(source: string): Promise<string | null> {
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(source, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: abort.signal,
    })
    if (!response.ok) return null

    const payloadText = await response.text()
    JSON.parse(payloadText)
    return payloadText
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function GET() {
  const now = Date.now()

  if (cache && now - cache.fetchedAt <= FRESH_TTL_MS) {
    return toCachedResponse(cache, false)
  }

  const sources = resolveSources()
  for (const source of sources) {
    const payloadText = await fetchWalletsList(source)
    if (!payloadText) continue

    cache = {
      payloadText,
      fetchedAt: now,
      source,
    }
    return toCachedResponse(cache, false)
  }

  if (cache && now - cache.fetchedAt <= STALE_TTL_MS) {
    return toCachedResponse(cache, true)
  }

  return jsonUtf8(
    { ok: false, error: "TONCONNECT_WALLETS_LIST_UNAVAILABLE" },
    { status: 502 },
  )
}
