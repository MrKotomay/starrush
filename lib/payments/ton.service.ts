import { Cell, beginCell } from "@ton/core"
import { assertTonApiKey } from "@/lib/payments/config"
import { normalizeAddress, toBigIntValue } from "@/lib/payments/utils"

type TonApiMessage = {
  source?: { address?: string | null } | null
  value?: unknown
  hash?: string | null
}

type TonApiTransaction = {
  hash?: string | null
  lt?: unknown
  utime?: unknown
  success?: unknown
  in_msg?: TonApiMessage | null
}

type TonApiTransactionsResponse = {
  transactions?: TonApiTransaction[]
}

function hashVariants(raw: string | null | undefined) {
  const value = (raw ?? "").trim()
  if (!value) return new Set<string>()

  const variants = new Set<string>()
  const noPrefix = value.replace(/^0x/i, "")
  const lower = noPrefix.toLowerCase()
  variants.add(lower)

  if (/^[a-f0-9]{64}$/i.test(noPrefix)) {
    const hex = noPrefix.toLowerCase()
    variants.add(hex)
    variants.add(Buffer.from(hex, "hex").toString("base64"))
    variants.add(Buffer.from(hex, "hex").toString("base64url"))
  }

  try {
    const asBase64 = Buffer.from(value, "base64")
    if (asBase64.length > 0) {
      variants.add(asBase64.toString("hex").toLowerCase())
      variants.add(asBase64.toString("base64"))
      variants.add(asBase64.toString("base64url"))
    }
  } catch {
    // ignore
  }

  try {
    const normalizedBase64Url = value.replace(/-/g, "+").replace(/_/g, "/")
    const asBase64Url = Buffer.from(normalizedBase64Url, "base64")
    if (asBase64Url.length > 0) {
      variants.add(asBase64Url.toString("hex").toLowerCase())
      variants.add(asBase64Url.toString("base64"))
      variants.add(asBase64Url.toString("base64url"))
    }
  } catch {
    // ignore
  }

  return variants
}

function hasHashIntersection(left: string | null | undefined, right: string | null | undefined) {
  const leftSet = hashVariants(left)
  const rightSet = hashVariants(right)
  if (leftSet.size === 0 || rightSet.size === 0) return false

  for (const item of leftSet) {
    if (rightSet.has(item)) return true
  }
  return false
}

function parseTransactionsResponse(payload: unknown): TonApiTransaction[] {
  if (!payload || typeof payload !== "object") return []
  const transactions = (payload as TonApiTransactionsResponse).transactions
  if (!Array.isArray(transactions)) return []
  return transactions
}

async function tonApiFetch(path: string): Promise<unknown> {
  const apiKey = assertTonApiKey()
  const response = await fetch(`https://tonapi.io${path}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    cache: "no-store",
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(`TONAPI_REQUEST_FAILED:${response.status}`)
  }

  return payload
}

export async function fetchRecentAccountTransactions(accountAddress: string, limit = 40) {
  const safeLimit = Math.max(1, Math.min(limit, 128))
  const payload = await tonApiFetch(
    `/v2/blockchain/accounts/${encodeURIComponent(accountAddress)}/transactions?limit=${safeLimit}&sort_order=desc`
  )
  return parseTransactionsResponse(payload)
}

export function buildTonConnectCommentPayload(comment: string) {
  const cell = beginCell().storeUint(0, 32).storeStringTail(comment).endCell()
  return cell.toBoc().toString("base64")
}

export function deriveTxHashFromBoc(boc: string) {
  const cell = Cell.fromBase64(boc)
  return cell.hash().toString("hex").toLowerCase()
}

export async function findMatchingTonTransaction(params: {
  txHash?: string | null
  senderAddress: string
  recipientAddress: string
  minAmountNano: bigint
  notOlderThanUnix?: number
}) {
  const transactions = await fetchRecentAccountTransactions(params.recipientAddress, 80)
  const senderNormalized = normalizeAddress(params.senderAddress)

  for (const tx of transactions) {
    const inMessage = tx.in_msg
    const sourceAddress = inMessage?.source?.address
    if (!sourceAddress) continue
    if (normalizeAddress(sourceAddress) !== senderNormalized) continue

    const success = tx.success === true
    if (!success) continue

    const value = toBigIntValue(inMessage?.value)
    if (value === null || value < params.minAmountNano) continue

    const utime = Number(tx.utime)
    if (Number.isFinite(params.notOlderThanUnix) && Number.isFinite(utime) && utime < (params.notOlderThanUnix as number)) {
      continue
    }

    if (params.txHash) {
      if (!hasHashIntersection(tx.hash, params.txHash) && !hasHashIntersection(inMessage?.hash, params.txHash)) {
        continue
      }
    }

    const txHash = (tx.hash ?? inMessage?.hash ?? "").trim()
    if (!txHash) continue

    return {
      txHash,
      lt: toBigIntValue(tx.lt)?.toString() ?? null,
      utime: Number.isFinite(utime) ? utime : null,
      amountNano: value.toString(),
    }
  }

  return null
}
