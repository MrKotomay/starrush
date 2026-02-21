import crypto from "crypto"
import { FairnessVersion, Round } from "@prisma/client"
import { db } from "@/lib/db"
import { gameConfig } from "@/lib/game-config"

export const DEFAULT_CLIENT_SEED = "starrush-default-client-seed-v1"
export const DEFAULT_FAIRNESS_NONCE = 0

type CrashPointInput = {
  fairnessVersion: FairnessVersion
  serverSeed: string
  serverSeedHash: string
  roundId: string
  fairnessNonce?: number
  clientSeed?: string | null
  houseEdge?: number | null
  maxCrash?: number | null
}

export type FairnessVerification = {
  roundId: string
  fairnessVersion: FairnessVersion
  fairnessNonce: number
  clientSeed: string
  serverSeedHash: string
  serverSeedReveal: string
  storedCrashPoint: number
  recomputedCrashPoint: number
  houseEdge: number
  maxCrash: number
  hashVerified: boolean
  crashPointVerified: boolean
  verified: boolean
}

export function sha256Hex(input: string) {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex")
}

export function calculateCrashPoint(input: CrashPointInput) {
  const digest =
    input.fairnessVersion === FairnessVersion.LEGACY_HASH_V0
      ? calculateLegacyDigest({
          serverSeedHash: input.serverSeedHash,
          roundId: input.roundId,
        })
      : calculateHmacDigest({
          serverSeed: input.serverSeed,
          roundId: input.roundId,
          fairnessNonce: input.fairnessNonce ?? DEFAULT_FAIRNESS_NONCE,
          clientSeed: input.clientSeed ?? DEFAULT_CLIENT_SEED,
        })

  return digestToCrashPoint(digest, {
    houseEdge: input.houseEdge,
    maxCrash: input.maxCrash,
    fairnessVersion: input.fairnessVersion,
  })
}

export function calculateLegacyDigest(input: { serverSeedHash: string; roundId: string }) {
  return sha256Hex(`${input.serverSeedHash}:${input.roundId}`)
}

export function calculateHmacDigest(input: {
  serverSeed: string
  roundId: string
  fairnessNonce: number
  clientSeed: string
}) {
  const message = `${input.roundId}:${input.fairnessNonce}:${input.clientSeed}`
  return crypto.createHmac("sha256", input.serverSeed).update(message, "utf8").digest("hex")
}

const DIGEST_SLICE_HEX_LENGTH = 13
const DIGEST_UNIT_INTERVAL_DIVISOR = Math.pow(2, 52)
const CRASH_STEP = 0.01
const TAIL_SPAN_FRACTION = 0.35
const MIN_TAIL_SPAN = 0.5
const MAX_TAIL_SPAN = 8

function digestSliceToUnitInterval(digestHex: string, offsetHex: number) {
  const start = Math.max(0, Math.floor(offsetHex))
  const normalized = digestHex.toLowerCase().replace(/[^0-9a-f]/g, "")
  const slice = normalized.slice(start, start + DIGEST_SLICE_HEX_LENGTH).padEnd(DIGEST_SLICE_HEX_LENGTH, "0")
  const intVal = Number.parseInt(slice, 16)
  if (!Number.isFinite(intVal) || intVal <= 0) return 0
  return intVal / DIGEST_UNIT_INTERVAL_DIVISOR
}

function quantizeCrash(raw: number) {
  return Math.floor(raw * 100) / 100
}

function digestToCrashPointV1(digestHex: string, houseEdge: number, maxCrash: number) {
  const r = digestSliceToUnitInterval(digestHex, 0)
  if (r <= 0) return 1.01

  const raw = (1 - houseEdge) / (1 - r)
  const crash = Math.max(1.01, quantizeCrash(raw))
  return Math.min(crash, maxCrash)
}

function digestToCrashPointV2BoundedMax(digestHex: string, houseEdge: number, maxCrash: number) {
  const primaryR = digestSliceToUnitInterval(digestHex, 0)
  if (primaryR <= 0) return 1.01

  const raw = (1 - houseEdge) / (1 - primaryR)
  if (raw <= maxCrash) {
    const crash = Math.max(1.01, quantizeCrash(raw))
    return Math.min(crash, maxCrash)
  }

  const upperBound = maxCrash <= 1.01 ? 1.01 : Math.max(1.01, maxCrash - CRASH_STEP)
  if (upperBound <= 1.01) {
    return 1.01
  }

  const desiredTailSpan = Math.min(maxCrash * TAIL_SPAN_FRACTION, MAX_TAIL_SPAN)
  const unclampedTailSpan = Math.max(MIN_TAIL_SPAN, desiredTailSpan)
  const boundedTailSpan = Math.max(CRASH_STEP, Math.min(unclampedTailSpan, upperBound - 1.01))
  const lowerBound = Math.max(1.01, upperBound - boundedTailSpan)

  const secondaryR = digestSliceToUnitInterval(digestHex, DIGEST_SLICE_HEX_LENGTH)
  const skewedTail = Math.pow(secondaryR, 0.42)
  const boundedRaw = lowerBound + (upperBound - lowerBound) * skewedTail
  const crash = Math.max(1.01, quantizeCrash(boundedRaw))

  return Math.min(upperBound, crash)
}

function toOptionalNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (value && typeof value === "object" && "toString" in value && typeof value.toString === "function") {
    const parsed = Number.parseFloat(value.toString())
    if (Number.isFinite(parsed)) return parsed
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function resolveHouseEdge(value: unknown) {
  const parsed = toOptionalNumber(value)
  if (parsed !== undefined && parsed > 0 && parsed < 1) return parsed
  return gameConfig.houseEdge
}

function resolveMaxCrash(value: unknown) {
  const parsed = toOptionalNumber(value)
  if (parsed !== undefined && parsed >= 1.01) return parsed
  return gameConfig.maxCrash
}

export function digestToCrashPoint(
  digestHex: string,
  params?: {
    houseEdge?: number | null
    maxCrash?: number | null
    fairnessVersion?: FairnessVersion | null
  }
) {
  const houseEdge = resolveHouseEdge(params?.houseEdge)
  const maxCrash = resolveMaxCrash(params?.maxCrash)
  const fairnessVersion = params?.fairnessVersion ?? FairnessVersion.HMAC_SHA256_V1

  if (fairnessVersion === FairnessVersion.HMAC_SHA256_V2_BOUNDED_MAX) {
    return digestToCrashPointV2BoundedMax(digestHex, houseEdge, maxCrash)
  }
  return digestToCrashPointV1(digestHex, houseEdge, maxCrash)
}

export function verifyRoundFairness(
  round: Pick<
    Round,
    | "id"
    | "serverSeed"
    | "serverSeedHash"
    | "crashMultiplier"
    | "fairnessVersion"
    | "fairnessNonce"
    | "clientSeed"
    | "houseEdge"
    | "maxCrash"
  > & {
    houseEdge?: Round["houseEdge"] | null
    maxCrash?: Round["maxCrash"] | null
  }
) {
  if (!round.serverSeed) throw new Error("ROUND_SEED_NOT_REVEALED")
  if (!round.crashMultiplier) throw new Error("ROUND_CRASH_POINT_NOT_SET")

  const fairnessNonce = round.fairnessNonce ?? DEFAULT_FAIRNESS_NONCE
  const clientSeed = round.clientSeed ?? DEFAULT_CLIENT_SEED
  const houseEdge = resolveHouseEdge(round.houseEdge)
  const maxCrash = resolveMaxCrash(round.maxCrash)
  const storedCrashPoint = Number(round.crashMultiplier.toString())
  const recomputedCrashPoint = calculateCrashPoint({
    fairnessVersion: round.fairnessVersion,
    serverSeed: round.serverSeed,
    serverSeedHash: round.serverSeedHash,
    roundId: round.id,
    fairnessNonce,
    clientSeed,
    houseEdge,
    maxCrash,
  })
  const hashVerified = sha256Hex(round.serverSeed) === round.serverSeedHash
  const crashPointVerified = Math.abs(storedCrashPoint - recomputedCrashPoint) < 1e-9

  return {
    roundId: round.id,
    fairnessVersion: round.fairnessVersion,
    fairnessNonce,
    clientSeed,
    serverSeedHash: round.serverSeedHash,
    serverSeedReveal: round.serverSeed,
    storedCrashPoint,
    recomputedCrashPoint,
    houseEdge,
    maxCrash,
    hashVerified,
    crashPointVerified,
    verified: hashVerified && crashPointVerified,
  } satisfies FairnessVerification
}

export async function verifyRoundFairnessById(roundId: string) {
  const round = await db.round.findUnique({ where: { id: roundId } })
  if (!round) throw new Error("ROUND_NOT_FOUND")
  return verifyRoundFairness(round)
}
