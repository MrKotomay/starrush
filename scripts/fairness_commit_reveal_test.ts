import { FairnessVersion, RoundEventType } from "@prisma/client"
import { db } from "../lib/db"
import { gameConfig } from "../lib/game-config"
import { redis } from "../lib/redis"
import { createRound, startRound, crashRound } from "../services/game-round.service"
import {
  DEFAULT_CLIENT_SEED,
  DEFAULT_FAIRNESS_NONCE,
  calculateCrashPoint,
  calculateHmacDigest,
  calculateLegacyDigest,
  digestToCrashPoint,
  sha256Hex,
  verifyRoundFairnessById,
} from "../services/game-fairness.service"

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message)
}

function expectNumber(actual: number, expected: number, message: string) {
  if (Math.abs(actual - expected) > 1e-9) {
    throw new Error(`${message}. expected=${expected} actual=${actual}`)
  }
}

async function testCrashPointDeterminism() {
  const serverSeed = "server-seed-unit-test-1"
  const roundId = "round-unit-1"
  const serverSeedHash = sha256Hex(serverSeed)

  const crashPoint = calculateCrashPoint({
    fairnessVersion: FairnessVersion.HMAC_SHA256_V1,
    serverSeed,
    serverSeedHash,
    roundId,
    fairnessNonce: DEFAULT_FAIRNESS_NONCE,
    clientSeed: DEFAULT_CLIENT_SEED,
  })

  expectNumber(crashPoint, 1.53, "deterministic crash point vector mismatch")

  const repeated = calculateCrashPoint({
    fairnessVersion: FairnessVersion.HMAC_SHA256_V1,
    serverSeed,
    serverSeedHash,
    roundId,
    fairnessNonce: DEFAULT_FAIRNESS_NONCE,
    clientSeed: DEFAULT_CLIENT_SEED,
  })

  expectNumber(repeated, crashPoint, "crash point should be stable across repeated calls")
  console.log("[PASS] fairness unit determinism")
}

async function testRoundCommitRevealFlow() {
  if (!redis) throw new Error("REDIS_NOT_CONFIGURED")

  const round = await createRound()

  const waitingEvent = await db.roundEventLog.findFirst({
    where: { roundId: round.id, eventType: RoundEventType.ROUND_WAITING },
    orderBy: { createdAt: "desc" },
  })

  expect(!!waitingEvent, "missing ROUND_WAITING event")
  const waitingPayload = waitingEvent!.payload as Record<string, unknown>
  expect(typeof waitingPayload.serverSeedHash === "string", "ROUND_WAITING must include serverSeedHash")
  expect(waitingPayload.serverSeed === undefined, "ROUND_WAITING must not reveal serverSeed")
  expect(typeof waitingPayload.houseEdge === "number", "ROUND_WAITING must include houseEdge")
  expect(typeof waitingPayload.maxCrash === "number", "ROUND_WAITING must include maxCrash")

  await startRound(round.id)

  const startedEvent = await db.roundEventLog.findFirst({
    where: { roundId: round.id, eventType: RoundEventType.ROUND_STARTED },
    orderBy: { createdAt: "desc" },
  })

  expect(!!startedEvent, "missing ROUND_STARTED event")
  const startedPayload = startedEvent!.payload as Record<string, unknown>
  expect(startedPayload.crashMultiplier === undefined, "ROUND_STARTED must not expose crashMultiplier")
  expect(startedPayload.serverSeed === undefined, "ROUND_STARTED must not reveal serverSeed")
  expect(typeof startedPayload.houseEdge === "number", "ROUND_STARTED must include houseEdge")
  expect(typeof startedPayload.maxCrash === "number", "ROUND_STARTED must include maxCrash")

  await crashRound(round.id)

  const crashedEvent = await db.roundEventLog.findFirst({
    where: { roundId: round.id, eventType: RoundEventType.ROUND_CRASHED },
    orderBy: { createdAt: "desc" },
  })

  expect(!!crashedEvent, "missing ROUND_CRASHED event")
  const crashedPayload = crashedEvent!.payload as Record<string, unknown>
  expect(typeof crashedPayload.serverSeed === "string", "ROUND_CRASHED must reveal serverSeed")
  expect(typeof crashedPayload.serverSeedHash === "string", "ROUND_CRASHED must include serverSeedHash")
  expect(typeof crashedPayload.crashMultiplier === "number", "ROUND_CRASHED must include crashMultiplier")
  expect(typeof crashedPayload.houseEdge === "number", "ROUND_CRASHED must include houseEdge")
  expect(typeof crashedPayload.maxCrash === "number", "ROUND_CRASHED must include maxCrash")

  const verification = await verifyRoundFairnessById(round.id)
  expect(verification.verified, "round fairness verification failed")
  expect(verification.houseEdge > 0 && verification.houseEdge < 1, "verification houseEdge must be valid")
  expect(verification.maxCrash >= 1.01, "verification maxCrash must be valid")
  console.log("[PASS] fairness commit-reveal integration")
}

async function testSecurityRegressionGuard() {
  const serverSeed = "security-seed-v1"
  const roundId = "security-round"
  const serverSeedHash = sha256Hex(serverSeed)

  const hmacDigest = calculateHmacDigest({
    serverSeed,
    roundId,
    fairnessNonce: DEFAULT_FAIRNESS_NONCE,
    clientSeed: DEFAULT_CLIENT_SEED,
  })
  const legacyDigest = calculateLegacyDigest({ serverSeedHash, roundId })

  expect(hmacDigest !== legacyDigest, "HMAC digest must differ from legacy hash-derived digest")

  const hmacCrash = digestToCrashPoint(hmacDigest)
  const syntheticHighDigest = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
  const syntheticHighCapCrash = digestToCrashPoint(syntheticHighDigest, { houseEdge: 0.01, maxCrash: 1000 })
  const customEconomicCrash = digestToCrashPoint(syntheticHighDigest, { houseEdge: 0.02, maxCrash: 10 })
  const boundedMaxCrash = digestToCrashPoint(syntheticHighDigest, {
    houseEdge: 0.02,
    maxCrash: 10,
    fairnessVersion: FairnessVersion.HMAC_SHA256_V2_BOUNDED_MAX,
  })
  const computedCrash = calculateCrashPoint({
    fairnessVersion: FairnessVersion.HMAC_SHA256_V1,
    serverSeed,
    serverSeedHash,
    roundId,
    fairnessNonce: DEFAULT_FAIRNESS_NONCE,
    clientSeed: DEFAULT_CLIENT_SEED,
  })

  expectNumber(computedCrash, hmacCrash, "HMAC crash point mismatch")
  expect(syntheticHighCapCrash > 10, "synthetic digest must exceed custom maxCrash")
  expectNumber(customEconomicCrash, 10, "custom maxCrash must clamp crash point")
  expect(boundedMaxCrash < 10, "bounded max fairness must avoid exact cap on overflow")
  expect(boundedMaxCrash >= 1.01, "bounded max fairness must stay within valid crash range")

  const legacyCrash = calculateCrashPoint({
    fairnessVersion: FairnessVersion.LEGACY_HASH_V0,
    serverSeed: "",
    serverSeedHash,
    roundId,
    fairnessNonce: DEFAULT_FAIRNESS_NONCE,
    clientSeed: DEFAULT_CLIENT_SEED,
  })
  expect(legacyCrash !== computedCrash, "legacy crash formula must not match HMAC formula")

  const legacyWithDefaultEconomics = calculateCrashPoint({
    fairnessVersion: FairnessVersion.LEGACY_HASH_V0,
    serverSeed: "",
    serverSeedHash,
    roundId,
    fairnessNonce: DEFAULT_FAIRNESS_NONCE,
    clientSeed: DEFAULT_CLIENT_SEED,
    houseEdge: null,
    maxCrash: null,
  })
  expect(legacyWithDefaultEconomics <= gameConfig.maxCrash, "legacy rounds must fallback to default maxCrash")
  console.log("[PASS] fairness security regression guard")
}

async function main() {
  await testCrashPointDeterminism()
  await testRoundCommitRevealFlow()
  await testSecurityRegressionGuard()
  console.log("[PASS] fairness tests completed")
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
    if (redis) await redis.quit()
  })
