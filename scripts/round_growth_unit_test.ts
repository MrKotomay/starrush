import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { loadGameConfig } from "../lib/game-config"
import { computeRoundMultiplier } from "../lib/round-multiplier"

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message)
}

function expectApprox(actual: number, expected: number, tolerance: number, message: string) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message}. expected=${expected} actual=${actual} tolerance=${tolerance}`)
  }
}

function expectThrows(fn: () => void, message: string) {
  let threw = false
  try {
    fn()
  } catch {
    threw = true
  }
  if (!threw) {
    throw new Error(message)
  }
}

function assertConsumerUsesSharedMultiplier(filePath: string) {
  const contents = readFileSync(resolve(process.cwd(), filePath), "utf8")
  expect(
    contents.includes("computeRoundMultiplier"),
    `${filePath} must use shared computeRoundMultiplier helper`
  )
}

function main() {
  const defaults = loadGameConfig({})
  expect(defaults.roundGrowthRate === 0.09, "default roundGrowthRate must be 0.09")

  const overridden = loadGameConfig({ ROUND_GROWTH_RATE: "0.12" })
  expect(overridden.roundGrowthRate === 0.12, "env override must set roundGrowthRate")

  expectThrows(
    () => loadGameConfig({ ROUND_GROWTH_RATE: "0" }),
    "invalid roundGrowthRate must throw during config loading"
  )

  expect(computeRoundMultiplier(0, 0.09).toFixed(4) === "1.0000", "t=0 must be 1.0000x")
  expect(computeRoundMultiplier(1, 0.09).toFixed(4) === "1.0942", "t=1 must be stable")
  expect(computeRoundMultiplier(5, 0.09).toFixed(4) === "1.5683", "t=5 must be stable")
  expect(computeRoundMultiplier(10, 0.09).toFixed(4) === "2.4596", "t=10 must be stable")

  expectApprox(computeRoundMultiplier(7.7, 0.09), 2, 0.01, "2x timing must be about 7.7s")
  expectApprox(computeRoundMultiplier(12.2, 0.09), 3, 0.02, "3x timing must be about 12.2s")

  assertConsumerUsesSharedMultiplier("workers/round-worker.ts")
  assertConsumerUsesSharedMultiplier("services/game-round-snapshot.service.ts")
  assertConsumerUsesSharedMultiplier("services/game-settlement.service.ts")

  console.log("[PASS] round growth unit test")
}

main()
