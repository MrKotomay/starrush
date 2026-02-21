import { createPlayerBetEventPayload, createPlayerCashoutEventPayload } from "../services/game-player-events.service"
import { buildPublicPlayerProfile } from "../lib/game/public-player"

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message)
}

function main() {
  const publicPlayer = buildPublicPlayerProfile({
    userId: "user-123456",
    username: "captain",
    firstName: "Star",
    lastName: "Pilot",
  })

  const betPayload = createPlayerBetEventPayload({
    roundId: "round-1",
    betAmount: "2.5",
    currency: "TON",
    placedAt: Date.now(),
    publicPlayer,
  })

  expect(betPayload.displayName === "Star Pilot", "player_bet payload must include displayName")
  expect(betPayload.username === "captain", "player_bet payload must include username when available")
  expect(
    betPayload.visibleToCurrentUserOnly === false && betPayload.isHidden === false,
    "player_bet payload must include visibility flags",
  )

  const cashoutPayload = createPlayerCashoutEventPayload({
    roundId: "round-1",
    multiplier: 2.25,
    payout: "5.625",
    profit: "3.125",
    betAmount: "2.5",
    currency: "TON",
    placedAt: Date.now(),
    publicPlayer,
  })

  expect(cashoutPayload.displayName === "Star Pilot", "player_cashout payload must include displayName")
  expect(cashoutPayload.username === "captain", "player_cashout payload must include username when available")
  expect(
    cashoutPayload.visibleToCurrentUserOnly === false && cashoutPayload.isHidden === false,
    "player_cashout payload must include visibility flags",
  )

  console.log("[PASS] ws player event payload metadata test")
}

main()
