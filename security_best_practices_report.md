# Security Best Practices Report

## Executive Summary

The main money-integrity risk is not in the crash round settlement path. The bet/cashout flow uses row locks, unique constraints, and house-risk checks. The highest-risk abuse paths are in staking, where concurrent requests can mint withdrawable balance, plus a few control-plane weaknesses that can bypass economic controls if configuration drifts or an admin session is abused.

Assumptions used for prioritization:
- The production deployment follows `docker-compose.yml` and `infra/caddy/Caddyfile`.
- `ALLOWED_WS_ORIGINS` is expected to be set in production, but the runtime code must still fail closed if it is missing.
- The user-facing threat model is more important than post-compromise admin abuse, but admin/write bypasses still matter because they can tamper with balances, rounds, and auditability.

## Critical Findings

### SBP-001: Concurrent unstake requests can mint withdrawable balance
- Severity: Critical
- Impact: A normal authenticated user can issue parallel unstake requests against the same staking position and create multiple pending unstake claims backed by the same principal, then later convert them into wallet balance.
- Evidence:
  - The code reads the staking position without row locking in `getAccruedPositionOrNull` at `services/staking.service.ts:477-494`.
  - It only checks for an existing pending request with a non-locking `findFirst` at `services/staking.service.ts:695-703`.
  - It then writes `stakedPrincipal: position.stakedPrincipal.minus(amount)` from a stale snapshot at `services/staking.service.ts:709-715`.
  - It creates a new pending request with no schema-level uniqueness guard for one pending request per user/pool at `services/staking.service.ts:724-733` and `prisma/schema.prisma:442-462`.
- Why this is exploitable:
  - Two concurrent transactions can both read the same `StakingPosition`, both see no pending request, both subtract from the same old `stakedPrincipal`, and both create `StakingUnstakeRequest` rows.
  - Later, `processMatureUnstakes` turns each pending request into a real `STAKING_UNSTAKE` ledger credit at `services/staking.service.ts:274-342`.
- Recommended fix:
  - Lock the `StakingPosition` row with `FOR UPDATE` before checking balances.
  - Enforce a DB-level uniqueness rule for at most one pending unstake per `(userId, poolId)`.
  - Replace stale-value writes with atomic increments/decrements or locked read-modify-write semantics.
  - Add an integration test that fires parallel `unstake` requests and asserts exactly one request is created.

### SBP-002: Concurrent reward claims can double-credit staking rewards
- Severity: High
- Impact: A normal authenticated user can send parallel claim requests and receive the same accrued reward more than once.
- Evidence:
  - The position is loaded and accrued without row locking at `services/staking.service.ts:477-494` and `services/staking.service.ts:603-605`.
  - A fresh reward ledger entry is created with a timestamp-based reference ID at `services/staking.service.ts:617-631`, so concurrent requests are not idempotent.
  - The reward deduction uses stale snapshots for both `pendingReward` and `rewardReserve` at `services/staking.service.ts:634-648`.
- Why this is exploitable:
  - Two concurrent transactions can compute the same `claimable` amount from the same pre-claim state.
  - Each transaction creates and applies its own `STAKING_REWARD` credit before either final state write fully serializes the claim.
  - The final `pendingReward` / `rewardReserve` state may only reflect one deduction while two credits were already applied.
- Recommended fix:
  - Lock the `StakingPosition` and `StakingPool` rows before computing `claimable`.
  - Use deterministic idempotency keys tied to a reward epoch or accrued-at checkpoint, not `Date.now()`.
  - Add a parallel claim integration test and reject duplicate reward claims against the same accrual window.

## High Findings

### SBP-003: WebSocket origin protection fails open if `ALLOWED_WS_ORIGINS` is empty
- Severity: High
- Impact: If deployment drift leaves `ALLOWED_WS_ORIGINS` empty, a malicious site can attempt to drive the authenticated game WebSocket from a victim browser and trigger bets or cashouts.
- Evidence:
  - Origin validation is only enforced when `allowedOrigins.length > 0` at `gateway/server.ts:125-139`.
  - The WebSocket channel is cookie-authenticated and can place bets / cash out via `handleBet` and `handleCashout` at `gateway/server.ts:141-230`.
  - The example env expects the allowlist to be present at `.env.example:38-44`.
- Notes:
  - The VDS deployment docs/examples do set `ALLOWED_WS_ORIGINS`, so this is a fail-open configuration bug, not proof that production is currently exposed.
  - This should still be treated as a code issue because the safe behavior is optional instead of mandatory.
- Recommended fix:
  - In production, reject all WebSocket connections if `ALLOWED_WS_ORIGINS` is empty.
  - Log startup as fatal when the allowlist is missing under `NODE_ENV=production`.
  - Add a deployment test that confirms cross-origin WebSocket handshakes are rejected.

### SBP-004: Admin Studio route is a raw-SQL write surface behind read-only guards
- Severity: High
- Impact: Any admin session can bypass normal admin write protections and audit flows by sending arbitrary SQL through `/api/admin/studio`, including direct balance edits, round tampering, and audit-log deletion.
- Evidence:
  - The route uses `requireAdminRead()` instead of `requireAdminWrite()` at `app/api/admin/studio/route.ts:31-38`.
  - It directly executes `body.query` and `body.sequence[*]` against Postgres at `app/api/admin/studio/route.ts:49-67`.
  - `requireAdminRead()` does not enforce CSRF or write-rate checks, while `requireAdminWrite()` does at `lib/admin-request.ts:70-87` vs `lib/admin-request.ts:89-129`.
- Why this matters:
  - This bypasses the explicit CSRF and audit discipline used by routes like wallet/treasury adjustments.
  - Even if only admins can reach it, this route expands post-auth compromise blast radius and defeats audit expectations for money-sensitive changes.
- Recommended fix:
  - Treat `/api/admin/studio` as a privileged write surface and gate it with `requireAdminWrite()`.
  - Restrict it to read-only SQL unless an explicit elevated mode is enabled.
  - Emit admin audit logs for every executed statement or disable SQL execution in production entirely.

### SBP-007: Cashout can succeed after the round has already reached its crash point
- Severity: High
- Impact: A normal authenticated player can win a cashout in a timing window where the round should already be lost, directly draining house bankroll.
- Evidence:
  - `cashoutPlayer()` locks the `Round` row, but then reads the live multiplier from Redis and pays out from that value at `services/game-settlement.service.ts:88-157`.
  - It never verifies that the chosen multiplier is still below `round.crashMultiplier` at `services/game-settlement.service.ts:129-157`.
  - The worker writes the current multiplier to Redis before it checks whether `multiplier >= crashPoint` and crashes the round at `workers/round-worker.ts:203-245`.
- Why this is exploitable:
  - There is a race window where Redis already contains a multiplier at or above the real crash point, while the DB row still shows `RUNNING`.
  - In that window, `cashoutPlayer()` can compute and apply a payout that should have been a loss.
- Recommended fix:
  - Reject cashouts when the effective multiplier is greater than or equal to the stored crash point.
  - Reorder worker state transitions so terminal crash state is committed before or atomically with terminal multiplier publication.
  - Add an integration test that spams `cashout` around the crash boundary.

## Medium Findings

### SBP-005: Referral attribution can be spoofed with an unsigned `startParam` body fallback
- Severity: Medium
- Impact: A first-time user can assign referral credit without a Telegram-signed `start_param`, enabling referral reward fraud and campaign attribution spoofing.
- Evidence:
  - The backend trusts `parsed.data.startParam` when Telegram `initData` does not include `start_param` at `app/api/auth/telegram/route.ts:44-45`.
  - That fallback directly drives `referredById` assignment at `app/api/auth/telegram/route.ts:57-68` and `app/api/auth/telegram/route.ts:80-91`.
  - The client pulls the fallback from arbitrary URL query params at `lib/use-telegram-user.ts:35-43` and submits it at `lib/use-telegram-user.ts:166-172`.
- Recommended fix:
  - Only accept referral attribution from Telegram-signed `initData.start_param`.
  - If platform compatibility requires URL fallback, sign it server-side and verify the signature before applying `referredById`.
  - Add an audit event when referral attribution is set for a new account.

### SBP-006: `GET /api/staking/overview` performs wallet-affecting state changes
- Severity: Medium
- Impact: A nominally read-only GET endpoint mutates finance state by maturing unstake requests into real credits, which weakens assumptions around CSRF, caching, observability, and replay.
- Evidence:
  - `GET /api/staking/overview` calls `getStakingOverview()` at `app/api/staking/overview/route.ts:6-14`.
  - `getStakingOverview()` enters a transaction that calls `processMatureUnstakes()` at `services/staking.service.ts:496-497`.
  - `processMatureUnstakes()` creates and applies `STAKING_UNSTAKE` credits at `services/staking.service.ts:274-342`.
- Recommended fix:
  - Move unstake settlement into a worker or an explicit POST action.
  - Keep GET routes side-effect free.
  - Mark all finance-changing routes as POST and protect them consistently.

### SBP-008: Queued bets can be announced as active round bets over WebSocket
- Severity: Medium
- Impact: A normal player can poison the live game feed and event log with a fake current-round bet, even though the server only queued the bet for the next round.
- Evidence:
  - `queueBetForNextRound()` returns `mode: "queued"` and still carries the current running round ID at `services/game-betting.service.ts:197-287`.
  - The WebSocket bet handler ignores `result.mode` and always emits `PLAYER_BET` at `gateway/handlers/bet.handler.ts:20-34`.
  - The HTTP route does the safer thing and only emits the event for `mode === "active"` at `app/api/game/bet/route.ts:50-60`.
- Recommended fix:
  - Make the WebSocket path match the HTTP path and only emit `PLAYER_BET` when `result.mode === "active"`.
  - Use a dedicated queued-bet event type if clients need to render queued state.

### SBP-009: Startup reconciliation ignores queued bets and can unlock stake that is still committed to the next round
- Severity: Medium
- Impact: After a worker restart, a queued bet can remain active while its locked funds are silently released, leading to broken accounting and a path to free or uncollectable losses.
- Evidence:
  - `repairLockedBalances()` only calculates expected locks from `RoundPlayer` rows in active/stale rounds at `services/reconciliation.service.ts:36-57`.
  - It then force-corrects `wallet.lockedBalance = expected` at `services/reconciliation.service.ts:109-119`.
  - `RoundQueuedBet` is never part of the expected locked amount calculation.
- Recommended fix:
  - Include `RoundQueuedBet` amounts in the reconciliation model for `lockedBalance`.
  - Add a repair path for dangling queued bets with missing locks.
  - Add a restart-focused integration test for queued bet activation and settlement.

### SBP-010: The waiting-phase risk engine leaks information about the hidden round outcome
- Severity: Medium
- Impact: By probing bet sizes during the waiting phase, a player can extract accept/reject signals derived from the hidden crash point and improve their expected value.
- Evidence:
  - The risk engine computes `exactCrashPoint` from the secret `serverSeed` while the round is still `WAITING` at `services/game-risk.service.ts:45-67`.
  - `assertCanAcceptBet()` then uses that hidden multiplier to accept or reject the stake at `services/game-risk.service.ts:190-259`.
  - `/api/game/bet` rate-limits requests, but still allows repeated probes in the waiting window at `app/api/game/bet/route.ts:26-34`.
- Notes:
  - The practical strength of the oracle depends on production bankroll and risk-cap settings. If caps almost never bind, the leak is weaker.
- Recommended fix:
  - Use only a public worst-case bound before round start, not the exact crash point derived from the secret seed.
  - Add tests that ensure pre-start bet acceptance does not vary with the hidden seed for equivalent public inputs.

### SBP-011: Worker locking can expire during a long tick and allow a second worker to enter round lifecycle code
- Severity: Low
- Impact: In an overlap/redeploy scenario, two workers can compete on round transitions and create inconsistent round/settlement state.
- Evidence:
  - The worker acquires a 15-second Redis lock, refreshes it once, then runs the full `tickRound()` without a heartbeat at `workers/round-worker.ts:310-335`.
  - The schema has no DB-level uniqueness rule guaranteeing a single active `Round` at `prisma/schema.prisma:226-245`.
- Recommended fix:
  - Refresh the lifecycle lock continuously while `tickRound()` is running.
  - Add a DB invariant so only one active round can exist at a time.
  - Alert on multiple active rounds or repeated worker lock contention.

## Positive Controls Observed

- Crash game betting and settlement use explicit row locks and uniqueness checks:
  - Round and wallet rows are locked before bet placement at `services/game-betting.service.ts:90-159`.
  - Round, wallet, and player rows are locked during cashout at `services/game-settlement.service.ts:69-118`.
  - Risk caps are enforced before accepting active and queued bets at `services/game-risk.service.ts:164-294`.
- Internal-only routes are blocked at the edge by default:
  - `infra/caddy/Caddyfile:15-20` returns `404` for `/api/ledger/internal/*`, `/api/payments/ton/reconcile`, and `/api/dev/*`.
- Admin write routes generally enforce origin + CSRF:
  - `lib/admin-request.ts:89-129`.

## Ownership and Bus-Factor Notes

Source: `output/ownership-map-out/summary.json` and `output/ownership-map-out/communities.json`.

- Hidden owner:
  - `MrKotomay <ipada310@gmail.com>` controls `100%` of the auth-tagged code in the last ownership window.
- Low bus-factor hotspots:
  - `app/api/admin/auth/telegram/route.ts`
  - `app/api/admin/auth/nonce/route.ts`
  - `app/api/auth/dev/route.ts`
  - `app/api/auth/telegram/route.ts`
  - `app/api/telegram/auth/route.ts`
  - `gateway/auth/ws-auth.ts`
- Important single-maintainer clusters:
  - Community 3 groups the payment pipeline (`app/api/payments/intents/[id]/route.ts`, `app/api/payments/ton/intent/route.ts`, `app/api/telegram/webhook/route.ts`, `lib/payments/*`, `prisma/schema.prisma`) under one effective maintainer.
  - `services/staking.service.ts`, `gateway/server.ts`, and `app/api/admin/studio/route.ts` each show bus factor `1`.
- Orphaned sensitive code:
  - None flagged by the ownership tool in the analyzed window.

## Testing Gaps

- There are parallel/risk tests for game betting, but no equivalent concurrency tests for staking claim/unstake flows.
- The highest-priority follow-up tests are:
  - parallel `unstake` against one position
  - parallel `claim` against one reward balance
  - production boot test with empty `ALLOWED_WS_ORIGINS`
  - referral attribution without signed Telegram `start_param`

## Recommended Remediation Order

1. Fix `SBP-001` and `SBP-002` in `services/staking.service.ts`.
2. Fix `SBP-007` in the crash-game settlement path.
3. Make WebSocket origin validation fail closed in production.
4. Reclassify or remove the raw-SQL admin studio write surface.
5. Remove unsigned referral fallback and side effects from `GET /api/staking/overview`.
