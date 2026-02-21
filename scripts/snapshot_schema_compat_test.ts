import { parseCurrentRoundSnapshotPayload } from "../lib/ws/game-ws-client"

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message)
}

function main() {
  const legacyLikePayload = {
    version: 1,
    serverTime: Date.now(),
    roundId: "round-compat",
    status: "WAITING",
    currentMultiplier: 1,
    startedAt: null,
    crashAt: null,
    endsAt: null,
    waitingEndsAt: Date.now() + 5000,
    crashMultiplier: null,
    fairness: {
      serverSeedHash: "hash",
      fairnessVersion: "HMAC_SHA256_V1",
      fairnessNonce: 0,
      clientSeed: null,
      effectiveClientSeed: "starrush-default-client-seed-v1",
      serverSeed: null,
    },
    players: [
      {
        id: "player-legacy",
        userId: "user-legacy",
        username: "legacy_user",
        amount: 3.5,
        currency: "TON",
        status: "ACTIVE",
        isCurrentUser: false,
        placedAt: Date.now(),
        cashoutMultiplier: null,
        payout: null,
        autoCashoutAt: null,
      },
    ],
    history: [],
    myBet: null,
    canPlaceBet: true,
    canCashOut: false,
  }

  const parsed = parseCurrentRoundSnapshotPayload(legacyLikePayload)
  expect(!!parsed, "snapshot parser must accept payloads without new fairness fields")
  expect(parsed!.fairness.houseEdge === 0.01, "snapshot parser must default houseEdge")
  expect(parsed!.fairness.maxCrash === 1000, "snapshot parser must default maxCrash")
  expect(parsed!.queuedBet === null, "snapshot parser must default queuedBet=null for legacy payloads")
  expect(parsed!.players[0].displayName === "legacy_user", "legacy snapshot player must get displayName fallback")
  expect(parsed!.players[0].username === "legacy_user", "legacy snapshot player must preserve username")
  expect(parsed!.players[0].isHidden === false, "legacy snapshot player must default isHidden=false")
  expect(parsed!.players[0].visibleToCurrentUserOnly === false, "legacy snapshot player must default visibility flag")
  expect(parsed!.players[0].avatarUrl === null, "legacy snapshot player must default avatarUrl=null")

  console.log("[PASS] snapshot schema compatibility test")
}

main()
