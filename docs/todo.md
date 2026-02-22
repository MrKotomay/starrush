# StarRush TODO (Auto-synced with code audit)

## 0.0) Hardening Update (2026-02-22)
- Next.js config deduplicated: single `next.config.ts` is now the source of truth; `next.config.mjs` removed.
- Build safety tightened: no `typescript.ignoreBuildErrors` override remains in active Next config.
- Event storage optimized: `MULTIPLIER_UPDATE` is no longer persisted in `RoundEventLog` (still published via Redis/WS).
- Round loop ownership unified: service-level `updateMultiplierLoop` removed; round ticks are worker-authoritative.
- Dependency explicitness improved: `react` added as a direct dependency aligned with `react-dom`.
- Compose persistence path fixed for PostgreSQL 18: volume uses `/var/lib/postgresql`.
- Dev auth hardened: `app/api/auth/dev` is now always disabled when `NODE_ENV=production`.
- Docker stack simplified to production-only mode: root `docker-compose.yml` is the single source of truth.
- Local-only compose/ngrok helpers were removed to reduce environment drift before VDS rollout.
- App bootstrap now preloads `safe.png`, and staking safe image is eager-loaded to reduce visible late texture loading.
- Unified container build: added root `Dockerfile` and removed `Dockerfile.local` split to avoid local/prod drift.
- Added full VDS compose stack in root `docker-compose.yml` (edge + app + gateway + worker + postgres + redis + migrate).
- Added production reverse proxy config `infra/caddy/Caddyfile` for single-domain HTTPS and `/ws` routing.
- Added deploy scripts `infra/deploy/deploy-vds.sh` and `infra/deploy/update-from-git.sh`.
- Added GitHub Actions auto-deploy workflow `.github/workflows/deploy-vds.yml`.
- Added dedicated VDS runbook: `docs/deploy-vds.md`.

## 0) Accounting Spec (canonical as of 2026-02-14)
- **Model**: lock-at-bet, debit-at-loss.
- **Definitions**
  - `balance`: total wallet funds including locked stake.
  - `lockedBalance`: reserved stake for unresolved bets.
  - `available`: `balance - lockedBalance`.
- **Principal timing**
  - Bet placed: `lockedBalance += stake`, `balance` unchanged.
  - Cashout win: `balance += profit`, then `lockedBalance -= stake`.
  - Crash loss settlement: `balance -= stake` and `lockedBalance -= stake`.
  - Round finished: no direct wallet mutation.
- **Ledger sign conventions**
  - `BET_LOCK`: negative amount (`-stake`), lock reservation only.
  - `BET_WIN`: positive amount (`+profit`), credited to `balance`.
  - `BET_LOSS_SETTLEMENT`: negative amount (`-stake`), debits principal and releases lock.
- **Transition examples (TON and STARS use identical logic)**

| Currency | Step | Ledger | Delta `balance` | Delta `lockedBalance` | Effect |
| --- | --- | --- | --- | --- | --- |
| TON/STARS | Place bet `2` | `BET_LOCK -2` | `0` | `+2` | stake reserved |
| TON/STARS | Cashout at `2.5x` | `BET_WIN +3` | `+3` | `-2` | principal returned + profit |
| TON/STARS | Crash loss | `BET_LOSS_SETTLEMENT -2` | `-2` | `-2` | principal removed |
| TON/STARS | Round finished | none | `0` | `0` | no wallet change |

## 0.1) Provable Fairness Spec (canonical as of 2026-02-14)
- **Model**: commit-reveal with fairness versioning.
- **Inputs**
  - `serverSeed` (secret until crash reveal).
  - `serverSeedHash = SHA-256(serverSeed)` (published in `ROUND_WAITING`).
  - `roundId` (used in message and verification output).
  - `fairnessNonce` (current default `0`, persisted per round).
  - `clientSeed` (optional, currently `null` in DB; verifier uses default `starrush-default-client-seed-v1` when missing).
  - `houseEdge` and `maxCrash` are runtime-configurable via env and persisted on every `Round` row; verifier uses per-round values (fallback to config defaults only for legacy/missing values).
- **Crash computation**
  - Current version `HMAC_SHA256_V2_BOUNDED_MAX`: `digest = HMAC_SHA256(key=serverSeed, message=\"${roundId}:${fairnessNonce}:${clientSeedOrDefault}\")`.
  - Base conversion uses first 52 bits and house-edge formula:
    - `r = int(first_13_hex_chars, 16) / 2^52`
    - `raw = ((1 - houseEdge) / (1 - r))`
    - if `raw <= maxCrash`, crash is `floor(raw * 100) / 100` in `[1.01, maxCrash]`
    - if `raw > maxCrash`, V2 uses a deterministic second digest slice to map into an upper tail just below cap (bounded-max path), preventing suspicious frequent exact-cap outcomes.
  - Current config defaults:
    - `GAME_HOUSE_EDGE=0.01`
    - `GAME_MAX_CRASH=1000`
  - Previous HMAC version `HMAC_SHA256_V1` (hard clamp to exact `maxCrash`) is retained for historical verification.
  - Legacy version `LEGACY_HASH_V0` is retained only for old rounds: `SHA256(\"${serverSeedHash}:${roundId}\")`.
- **Reveal + verification**
  - Pre-round (`ROUND_WAITING`) emits hash and fairness metadata, never `serverSeed`.
  - Fairness metadata includes `serverSeedHash`, `fairnessNonce`, `effectiveClientSeed`, `houseEdge`, and `maxCrash` for the effective round rules.
  - `ROUND_STARTED` no longer emits `crashMultiplier`.
  - Post-crash (`ROUND_CRASHED`) emits `serverSeed` reveal + `crashMultiplier` + metadata.
  - Verifier checks:
    - `SHA-256(serverSeedReveal) == serverSeedHash`
    - recomputed crash point equals stored crash point for the round's fairness version.

## 0.2) Risk Management / House Treasury (canonical as of 2026-02-14)
- **House treasury models**
  - `HouseWallet` keeps platform bankroll by currency (`TON`, `STARS`).
  - `HouseLedgerEntry` is an audit trail for house-side balance deltas (`type`, signed `amount`, optional `roundId`, optional `userId`, `createdAt`, metadata).
- **House PnL accounting rules (paired transactionally with user settlement)**
  - User crash loss (`BET_LOSS_SETTLEMENT`): `HouseWallet.balance += stake` (house credit).
  - User cashout profit (`BET_WIN`): `HouseWallet.balance -= profit` (house debit).
  - User wallet/ledger updates and house wallet/ledger updates happen in the same DB transaction.
  - `debitHouse` is guarded: if debit would make balance negative, operation fails with `HOUSE_INSUFFICIENT_BANKROLL` and the whole settlement transaction rolls back.
- **Automated bankroll risk limits (limits only, no RNG manipulation)**
  - Concurrency hardening: bet acceptance is atomic per `(currency, roundId)` via PostgreSQL transaction advisory lock (`pg_advisory_xact_lock`), taken inside the same transaction as bet creation + stake lock.
  - `bankroll = HouseWallet.balance(currency)`.
  - `betWorstCaseProfit = stake * (round.maxCrash - 1)`.
  - `existingExposure = sum(BET_PLACED stakes for round+currency) * (round.maxCrash - 1)`.
  - Exposure is only considered while round status is `WAITING` or `RUNNING`; for `CRASHED` / `FINISHED`, exposure is treated as `0`.
  - Bet is accepted only if both hold:
    - `betWorstCaseProfit <= bankroll * RISK_MAX_PAYOUT_FRACTION_PER_BET`
    - `existingExposure + betWorstCaseProfit <= bankroll * RISK_MAX_EXPOSURE_FRACTION_PER_ROUND`
  - Running-round queue bets are now risk-checked separately against conservative future bankroll:
    - `availableBankrollForQueue = bankroll - currentRunningRoundExposure`.
    - `queuedExposure = sum(RoundQueuedBet stakes by currency) * (round.maxCrash - 1)`.
    - Queue acceptance requires:
      - `betWorstCaseProfit <= availableBankrollForQueue * RISK_MAX_PAYOUT_FRACTION_PER_BET`
      - `queuedExposure + betWorstCaseProfit <= availableBankrollForQueue * RISK_MAX_EXPOSURE_FRACTION_PER_ROUND`
  - Queue activation into a freshly created round re-validates risk atomically; if activation cannot proceed, queued stake lock is released and queue entry is deleted (no silent fund loss).
  - Rejections return domain error code `RISK_LIMIT_EXCEEDED` before stake lock, without changing crash RNG/outcomes.
  - House-side underflow protection returns domain error code `HOUSE_INSUFFICIENT_BANKROLL` (e.g. insufficient treasury for a cashout win).
- **Risk/treasury env vars**
  - `RISK_MAX_PAYOUT_FRACTION_PER_BET` (default `0.02`)
  - `RISK_MAX_EXPOSURE_FRACTION_PER_ROUND` (default `0.10`)
  - `HOUSE_BANKROLL_INITIAL_TON` (default `0`)
  - `HOUSE_BANKROLL_INITIAL_STARS` (default `0`)
  - `ENABLE_DEV_TREASURY` (default `0`, must be `1` in development to allow dev treasury funding API)
- **Manual verification**
  - Run accounting integration test: `npm run test:accounting`.
  - Run fairness verification regression test: `npm run test:fairness`.
  - Run parallel contention risk test: `npm run test:risk-parallel` (near exposure cap, N concurrent bets; only one additional bet accepted).
  - Run queued risk test: `npm run test:risk-queued` (running-round queue acceptance near cap + duplicate activation lock-release safety).
  - Run settlement arithmetic unit test: `npm run test:cashout-math`.
  - Run snapshot backward-compat validator test: `npm run test:snapshot-schema`.
  - For risk rejection behavior, set low house bankroll env and attempt a large bet; expect `RISK_LIMIT_EXCEEDED` before `BET_LOCK` entry creation.
  - For `HOUSE_INSUFFICIENT_BANKROLL`, use dev treasury fund flow (`npm run house:fund -- --currency TON --amount 1000`) to provision a safe bankroll before stress tests.

## 0.3) Dev Treasury Funding (canonical as of 2026-02-17)
- **Purpose**
  - Local/dev quality-of-life funding for `HouseWallet` (`TON` / `STARS`) without manual SQL.
- **API**
  - `POST /api/dev/treasury/fund`
  - Body: `{ "currency": "TON" | "STARS", "amount": "1000" | 1000 }`
- **Security gates (must all pass)**
  - `NODE_ENV=development`
  - `ENABLE_DEV_TREASURY=1`
  - Auth header: `x-internal-key: <INTERNAL_API_KEY>`
- **Accounting behavior**
  - Credits house wallet via `creditHouse(...)` and creates `HouseLedgerEntry` with type `HOUSE_FUND`.
  - Does not touch fairness, RNG, crash economics, or per-user outcomes.
- **CLI wrapper**
  - `npm run house:fund -- --currency TON --amount 1000`
  - Optional: `--base-url http://localhost:3000` and `--internal-key <key>`
- **Manual verification**
  - Set env: `ENABLE_DEV_TREASURY=1` and ensure `INTERNAL_API_KEY` is set.
  - Start app: `npm run dev`.
  - Run: `npm run house:fund -- --currency TON --amount 1000`.
  - Expect `ok: true` JSON with updated `wallet.balance` and a `ledger` entry of type `HOUSE_FUND`.
  - Set `ENABLE_DEV_TREASURY=0` (or run non-development env) and retry; expect `DEV_TREASURY_DISABLED` with HTTP 403.
  - Omit or change `x-internal-key`; expect `FORBIDDEN` with HTTP 403.

## 1) Completed (verified in code)
- [x] Telegram initData signature verification and user payload parsing are implemented. Evidence: `lib/telegram-auth.ts` (`verifyTelegramWebAppInitData`, `extractTelegramUserFromInitData`).
- [x] Telegram auth endpoint upserts user, creates TON/STARS wallets, and sets session cookie. Evidence: `app/api/auth/telegram/route.ts` (`POST`).
- [x] Legacy auth endpoint is mapped to the new Telegram auth route. Evidence: `app/api/telegram/auth/route.ts` (`POST` re-export).
- [x] Dev auth fallback endpoint exists behind env gating. Evidence: `app/api/auth/dev/route.ts` (`isDevAuthEnabled`, `POST`, `GET`).
- [x] Session storage and cache are implemented with DB + Redis and token hashing. Evidence: `lib/session.ts` (`createSession`, `getSession`, `refreshSession`, `revokeSession`).
- [x] Authenticated current-user resolution from session cookie is implemented. Evidence: `lib/auth.ts` (`getCurrentUser`, `requireAuth`).
- [x] Wallet and ledger read APIs are implemented. Evidence: `app/api/wallets/route.ts` (`GET`), `app/api/wallets/balance/route.ts` (`GET`), `app/api/ledger/history/route.ts` (`GET`).
- [x] Internal ledger creation API with API key and rate limit is implemented. Evidence: `app/api/ledger/internal/create/route.ts` (`POST`).
- [x] Core DB schema and migrations for users/sessions/wallets/ledger/rounds/events are present. Evidence: `prisma/schema.prisma`, `prisma/migrations/*`.
- [x] Round lifecycle services and event emission to DB + Redis are implemented. Evidence: `services/game-round.service.ts` (`createRound`, `startRound`, `crashRound`, `finishRound`), `services/game-events.service.ts` (`emitGameEvent`).
- [x] Round worker loop with Redis lock, recovery, crash handling, and loss settlement trigger is implemented. Evidence: `workers/round-worker.ts` (`runWorker`, `tickRound`, `recoverActiveRound`).
- [x] Betting and cashout API/service flows with transactional locking and rate limiting are implemented. Evidence: `app/api/game/bet/route.ts`, `app/api/game/cashout/route.ts`, `services/game-betting.service.ts`, `services/game-settlement.service.ts`.
- [x] WebSocket gateway with cookie auth, message validation, in-memory limiter, and Redis subscription fanout is implemented. Evidence: `gateway/server.ts`, `gateway/auth/ws-auth.ts`, `gateway/types/ws-events.ts`, `gateway/redis/redis-subscriber.ts`.
- [x] Financial settlement accounting is corrected: crash losses now debit principal with non-zero `BET_LOSS_SETTLEMENT`, cashout wins credit profit, and crash flow no longer pre-marks players `LOST` before settlement. Evidence: `services/game-settlement.service.ts`, `services/game-round.service.ts`, `lib/ledger.service.ts`.
- [x] Money-flow integrity constraints were added at DB level (`balance >= 0`, `lockedBalance >= 0`, `lockedBalance <= balance`) and `RoundPlayer.userId -> User.id` FK was added. Evidence: `prisma/migrations/20260214150000_wallet_invariants_roundplayer_fk/migration.sql`, `prisma/schema.prisma`.
- [x] Deterministic integration tests now cover TON/STARS for loss, cashout win, duplicate bet retry, and duplicate cashout retry with exact `balance`/`lockedBalance` assertions. Evidence: `scripts/accounting_settlement_integration_test.ts`.
- [x] Provable fairness commit-reveal is fixed and versioned: crash point is now derived from secret `serverSeed` via HMAC and legacy rounds are explicitly marked. Evidence: `services/game-fairness.service.ts`, `services/game-round.service.ts`, `prisma/migrations/20260214162000_add_fairness_versioned_commit_reveal/migration.sql`, `prisma/schema.prisma`.
- [x] Round crash economics are now runtime-configurable and persisted per-round (`houseEdge`, `maxCrash`) and included in fairness metadata payloads for verification. Evidence: `lib/game-config.ts`, `services/game-fairness.service.ts`, `services/game-round.service.ts`, `services/game-round-snapshot.service.ts`, `prisma/migrations/20260214223000_add_round_economics_and_house_treasury/migration.sql`.
- [x] Fairness verification tooling and regression tests are implemented. Evidence: `scripts/verify_round_fairness.ts`, `scripts/fairness_commit_reveal_test.ts`.
- [x] House treasury accounting is implemented with per-currency house wallets/ledger and transactional PnL settlement integration for user losses/wins. Evidence: `lib/house-ledger.service.ts`, `services/game-settlement.service.ts`, `prisma/schema.prisma`, `scripts/accounting_settlement_integration_test.ts`.
- [x] Dev-only house treasury funding endpoint and CLI wrapper are implemented with strict env + auth gating (`NODE_ENV=development`, `ENABLE_DEV_TREASURY=1`, `x-internal-key`). Evidence: `app/api/dev/treasury/fund/route.ts`, `scripts/dev_house_fund.ts`, `package.json`, `.env.example`, `prisma/schema.prisma`, `prisma/migrations/20260217113000_add_house_fund_ledger_type/migration.sql`.
- [x] Automated bankroll risk management now rejects overexposing bets pre-lock via limits (`RISK_MAX_PAYOUT_FRACTION_PER_BET`, `RISK_MAX_EXPOSURE_FRACTION_PER_ROUND`) without changing crash RNG. Evidence: `services/game-risk.service.ts`, `services/game-betting.service.ts`, `app/api/game/bet/route.ts`, `gateway/handlers/bet.handler.ts`.
- [x] Bet acceptance race hardening is in place: risk checks + bet activation are atomic under transaction advisory lock keyed by `(currency, roundId)`, with a parallel contention test to prevent oversubscription regressions. Evidence: `services/game-risk.service.ts`, `services/game-betting.service.ts`, `scripts/risk_parallel_bet_integration_test.ts`.
- [x] House treasury non-negative invariant is enforced at service and DB levels (`HOUSE_INSUFFICIENT_BANKROLL` guard + `HouseWallet.balance >= 0` check). Evidence: `lib/house-ledger.service.ts`, `prisma/migrations/20260214231500_house_wallet_non_negative/migration.sql`, `app/api/game/cashout/route.ts`, `gateway/handlers/cashout.handler.ts`.
- [x] Cashout math semantics are explicit and test-covered (`payout = stake * multiplier`, `profit = payout - stake`) with deterministic precision handling. Evidence: `services/game-settlement.service.ts`, `scripts/cashout_math_unit_test.ts`.
- [x] Snapshot validator backward compatibility is hardened for fairness extensions (`houseEdge`/`maxCrash` optional with defaults) and test-covered. Evidence: `lib/ws/game-ws-client.ts`, `scripts/snapshot_schema_compat_test.ts`.
- [x] Queued bet risk path is hardened: queue acceptance now enforces conservative bankroll/exposure limits and activation releases locked stake on rejection/duplicate activation paths. Evidence: `services/game-risk.service.ts`, `services/game-betting.service.ts`.
- [x] Fairness cap behavior is versioned with bounded-max distribution (`HMAC_SHA256_V2_BOUNDED_MAX`) to avoid frequent exact-cap crashes while preserving deterministic verification. Evidence: `services/game-fairness.service.ts`, `services/game-round.service.ts`, `scripts/fairness_commit_reveal_test.ts`, `prisma/migrations/20260218104500_add_fairness_v2_bounded_max/migration.sql`.
- [x] Backend-authoritative game loop sync is implemented for lifecycle + multiplier: authenticated snapshot API, browser WS client with reconnect/resync, and frontend adapter now drive `StarRushPanel`/Phaser from backend state (local `RoundEngine` bypassed for authoritative state). Evidence: `app/api/game/round/current/route.ts`, `services/game-round-snapshot.service.ts`, `lib/ws/game-ws-client.ts`, `lib/game/backend-round-state-adapter.ts`, `components/game/StarRushPanel.tsx`.
- [x] Bet/Cashout UI commands are now REST-authoritative from the Rush panel/modal: `placeBet(amount, currency)` and `cashout()` call backend APIs, apply loading/disabled states, surface domain errors, and resync snapshot state after command completion. Evidence: `components/game/StarRushPanel.tsx`, `lib/game/backend-round-state-adapter.ts`, `components/bets/PlaceBetModal.tsx`.
- [x] Frontend adapter now applies `player_bet` / `player_cashout` WS events directly for low-latency player-list reconciliation (idempotent upsert/update with round guard + fallback resync on mismatch). Evidence: `lib/game/backend-round-state-adapter.ts`, `lib/ws/game-ws-client.ts`, `gateway/redis/redis-subscriber.ts`, `gateway/types/ws-events.ts`.
- [x] WS player payload metadata parity is complete: `player_bet` / `player_cashout` now carry a unified public-player contract (`displayName`, `username`, visibility flags, safe avatar), and snapshot + gateway + adapter are aligned to the same compatible shape to avoid metadata-driven fallback resync. Evidence: `services/game-player-events.service.ts`, `services/game-betting.service.ts`, `services/game-settlement.service.ts`, `services/game-round-snapshot.service.ts`, `gateway/redis/redis-subscriber.ts`, `gateway/handlers/bet.handler.ts`, `gateway/handlers/cashout.handler.ts`, `lib/ws/game-ws-client.ts`, `lib/game/backend-round-state-adapter.ts`, `lib/game/backend-round-types.ts`, `lib/game/public-player.ts`.
- [x] Phaser scene live phase transitions now apply without refresh: runtime bridge continuously forwards adapter snapshots, and scene transition handlers apply idempotent `PREPARING/RUNNING/CRASHED/RESETTING` visual transitions per round. Evidence: `components/game/StarRushPanel.tsx`, `game/StarRushGame.ts`.
- [x] Purple background glow/nebula overlays were fully removed; game background is now clean deterministic deep-space gradient without radial purple illumination. Evidence: `styles/starrush.module.css` (removed `.gameArea::before/.gameArea::after`), `game/StarRushGame.ts` (`redrawBg` center radial fill removed).
- [x] WS bet command path now emits canonical `PLAYER_BET` events, aligning room broadcasts with REST behavior. Evidence: `gateway/handlers/bet.handler.ts`.
- [x] Round loop progression is now continuous with zero players/bets: worker no longer stalls in `CRASHED` when Redis `crashed_at` is missing, and recovery restores crash timestamps on restart. Evidence: `workers/round-worker.ts` (`tickRound`, `recoverActiveRound`, `resolveCrashedAt`), `services/game-round.service.ts` (debug lifecycle emission logs).

## 2) In Progress (partially implemented)
- **Bet modal multi-currency UI is partial** | What exists now: modal supports TON/STARS/GIFTS tabs, TON/STARS bet submit now calls backend crash bet API, and submit states are wired. | What is missing to finish: GIFTS tab remains placeholder and non-TON wallet displays/flows are still incomplete. | Clear next action: define GIFTS backend flow and add multi-currency wallet balances in panel UI.
- **Product shell actions are partially wired** | What exists now: profile Deposit/Withdraw buttons now call backend wallet action APIs (`POST /api/wallets/deposit`, `POST /api/wallets/withdraw`) with loading/error states and live wallet/ledger refresh; wallet settings entry now opens a live wallet overview using `/api/wallets` + `/api/ledger/history`; staking entry now switches tab. | What is missing to finish: current deposit/withdraw flow is explicitly dev-gated (`ENABLE_DEV_WALLET_ACTIONS=1`) and not integrated with real payment rails; remaining settings/referral/profile actions still include placeholders or mock values. | Clear next action: replace dev wallet actions with TON Connect + Stars payment flows and wire remaining settings/profile actions to concrete APIs.

## 3) Not Started / Missing
### Game <-> Backend integration

### Buttons/actions wiring (UI -> API -> state)
- Replace current dev-gated profile Deposit/Withdraw wiring with production payment-backed flows, and align remaining wallet plus actions to the same contracts.
- Replace mock profile/staking/referral stats with API-backed values and loading/error states.

### Backend business logic (rounds, bets, settlement, ledger, wallet, sessions)
- Add explicit logout/session revoke API route for client session lifecycle.
- Remove or consolidate duplicate/unused domain logic (`cashoutPlayer` in `services/game-round.service.ts`) to avoid drift.
- AUDIT: Current multiplier/crash algorithm located in `services/game-fairness.service.ts` (`calculateCrashPoint`, `calculateHmacDigest`, `digestToCrashPoint`), `services/game-round.service.ts` (`createRound`, `startRound`, `crashRound`, `calculateCrashPoint`), `workers/round-worker.ts` (`tickRound` exponential multiplier via `Math.exp(GROWTH_RATE * elapsedSeconds)`), `services/game-round-snapshot.service.ts` (`resolveCurrentMultiplier` fallback), `lib/game/backend-round-state-adapter.ts` (`computeSmoothedMultiplier` interpolation), and `game/StarRushGame.ts` (`applySnapshot`, `lerpCoeff`). Open questions: keep/remove unused `updateMultiplierLoop`; make `HOUSE_EDGE`/`MAX_CRASH` runtime-configurable; unify multiplier precision/tick cadence across worker/snapshot/settlement fallbacks to avoid edge drift.

### Database (schema, migrations, integrity constraints, indexes, idempotency)
- Add a partial unique index enforcing a single active round (`WAITING`/`RUNNING`) at a time.
- Add consistency enforcement between `LedgerEntry.walletId`, `LedgerEntry.userId`, and `LedgerEntry.currency`.
- Add idempotency table/keys for external payment callbacks and retried financial commands.

### Payments
#### TON Connect
- Implement frontend TonConnect session and wallet address binding to user profile.
- Implement backend TON transfer verification and ledger crediting flow.
- Implement withdrawal request flow with status tracking and admin/automation hooks.

#### Telegram Stars
- Implement Telegram Stars invoice creation flow and callback endpoint.
- Map successful Stars payments into `Wallet(STARS)` + ledger entries.
- Implement refund/failed-payment reconciliation handling.

#### Telegram Gifts/NFT gifts flow
- Define gift ownership source and verification pipeline.
- Implement gift/NFT gift ingestion to internal inventory/economy model.
- Implement betting flow using gifts inventory with clear conversion rules.

### Security & anti-fraud basics
- Add WS origin validation and enforce secure cookie/WSS policy in production.
- Add replay protection for Telegram auth payload usage (`query_id`/auth nonce tracking).
- Replace plain internal key usage with signed internal requests (timestamp + signature window).

### Testing (unit/integration/e2e/smoke)
- Add unit tests for payout math, loss settlement math, and fairness algorithm.
- Add end-to-end tests for Telegram auth + place bet + cashout + round finish flow.
- Add CI pipeline for lint + tests + migration apply/check on clean DB.

### DevOps/monitoring/logging
- Add structured JSON logging with request/round/user correlation IDs.
- Add metrics and alerts for round-worker loop health, bet/cashout failures, and settlement lag.
- Add health/readiness endpoints for app, gateway, and worker processes.
- Add deployment process definitions for worker singleton behavior and restart guarantees.

## 4) Priority roadmap
### P0 (must do now)
- [x] **Fix financial settlement correctness (completed 2026-02-14)** | Why it mattered: economy accounting could produce incorrect balances. | Completed outcome: loss path debits principal, win path credits expected delta, DB constraints are in place, and integration tests verify exact `balance` + `lockedBalance` transitions for TON/STARS.
- [x] **Fix provable fairness implementation (completed 2026-02-14)** | Why it mattered: crash point was derivable before reveal. | Completed outcome: commit-reveal with fairness versioning is live, crash uses secret-seed HMAC path, verifier script is available, and fairness tests cover determinism + integration + regression guard.
- **Connect game loop to backend state/events (in progress)** | Why it matters: current gameplay must stay authoritative to backend. | Progress: snapshot endpoint + WS reconnect client + backend-driven adapter are in place, local `RoundEngine` authority is removed, panel Bet/Cashout commands are REST-authoritative, and adapter now consumes live `player_bet`/`player_cashout` deltas directly. | Remaining for Definition of Done: improve WS player payload completeness so reconciliation does not need fallback resync when metadata is sparse. | Dependencies/blockers: backend player event payload contract extension. | Estimated complexity: M.
  - Additional progress (2026-02-14): empty-player round progression is fixed in worker recovery/tick path; lifecycle now keeps cycling without bets.
- **Make key buttons functional end-to-end** | Why it matters: core user actions are not fully wired to business logic. | Progress: Bet/Cashout are backend-authoritative; profile Deposit/Withdraw/Wallet now call backend wallet APIs with loading/error states, but deposit/withdraw are still dev-gated and not connected to real payment rails. | Acceptance criteria (Definition of Done): Bet, Cashout, Deposit, Withdraw, and Wallet actions call production-ready APIs and update UI state with errors/loading/retries. | Dependencies/blockers: payment endpoints and chosen transport path. | Estimated complexity: L.
- **Add DB integrity and idempotency hardening for money flows** | Why it matters: retries and races can corrupt accounting without strong DB guards. | Acceptance criteria (Definition of Done): new constraints/indexes/idempotency records applied by migrations and validated by race/retry tests. | Dependencies/blockers: migration rollout plan. | Estimated complexity: M.

### P1 (next)
- **Integrate TON Connect deposits** | Why it matters: enables real wallet funding path for TON gameplay. | Acceptance criteria (Definition of Done): wallet connect, transaction verify, ledger credit, user-visible balance refresh. | Dependencies/blockers: TON provider choice and security policy. | Estimated complexity: L.
- **Integrate Telegram Stars payments** | Why it matters: enables in-Telegram payment path and STARS balance usage. | Acceptance criteria (Definition of Done): invoice creation, callback verification, STARS wallet crediting, failure/retry handling. | Dependencies/blockers: bot payment setup and callback hosting. | Estimated complexity: L.
- **Observability baseline** | Why it matters: production incidents are hard to detect/debug with console logs only. | Acceptance criteria (Definition of Done): structured logs, core metrics, alert rules, basic dashboards. | Dependencies/blockers: monitoring stack choice. | Estimated complexity: M.
- **Automated test suite and CI** | Why it matters: current reliability depends on manual scripts. | Acceptance criteria (Definition of Done): unit + integration + smoke tests run in CI on each PR/merge. | Dependencies/blockers: test database/redis strategy in CI. | Estimated complexity: M.

### P2 (later)
- **Implement gifts/NFT gifts gameplay economy** | Why it matters: expands monetization/features beyond TON/STARS. | Acceptance criteria (Definition of Done): verified gift ingestion, conversion rules, and UI betting flow. | Dependencies/blockers: product rules and legal constraints. | Estimated complexity: L.
- **Replace remaining mock profile/staking/referral data** | Why it matters: production UX must reflect real user/account state. | Acceptance criteria (Definition of Done): all displayed balances/stats are API-driven with fallback/loading states. | Dependencies/blockers: backend endpoints for each widget. | Estimated complexity: M.
- **Clean up dead/duplicate game logic paths** | Why it matters: duplicate logic increases bug risk and slows iteration. | Acceptance criteria (Definition of Done): unused paths removed, docs and tests updated, no behavior regression. | Dependencies/blockers: completion of backend-driven game client. | Estimated complexity: S.
- **Scale-out hardening for multi-instance gateway/worker** | Why it matters: required for stable growth and incident tolerance. | Acceptance criteria (Definition of Done): validated lock behavior, pub/sub fanout checks, and documented failover playbook. | Dependencies/blockers: production-like staging environment. | Estimated complexity: M.

## 5) Next 3 execution batches
### Batch A (this week)
- [x] Implement settlement accounting fix (loss debit + win credit consistency) and ship related DB constraints.
- [x] Fix provable fairness crash computation to use secret seed and keep pre-round data non-predictive.
- [x] Add one frontend game data adapter that consumes backend round events and supports reconnect + snapshot resync.
- [x] Fix worker empty-player progression so rounds cycle continuously even with zero bets (`WAITING -> RUNNING -> CRASHED -> FINISHED -> WAITING`).
- [x] Wire Bet/Cashout buttons to backend transport and remove local-only state transitions for those actions. Evidence: `components/game/StarRushPanel.tsx`, `lib/game/backend-round-state-adapter.ts`, `components/bets/PlaceBetModal.tsx`.
- [x] Add integration tests for bet -> cashout/loss -> settlement wallet outcomes.

### Batch B (after A)
- Wire Deposit/Withdraw/Wallet actions to real backend contracts and display transactional statuses.
- Implement TON Connect deposit flow end-to-end with ledger crediting.
- Implement Telegram Stars invoice + callback credit flow.
- Add CI workflow and baseline observability (structured logs + core metrics + health checks).

### Batch C (after B)
- Implement gifts/NFT gifts ingestion and betting flow.
- Replace remaining mock profile/staking/referral cards with API data.
- Remove duplicate/unused backend game logic paths after migration to single authoritative flow.
- Add scale/failover validation for worker/gateway multi-instance deployment.

## 6) Risks and unknowns
- Should client commands be authoritative over REST, WS, or hybrid (and what is the exact ownership boundary)?
- Should player-provided client seeds be exposed in UI now or remain server-default until frontend sync is complete?
- What are final business rules for STARS and gifts conversion into playable balances?
- Are there custody/compliance constraints for TON deposits/withdrawals in target regions?
- What SLAs are expected for round continuity during Redis/DB partial outages?

## 7) Local runbook (for future + teammate)
- Install deps once: `npm install`
- Main app (Next.js): `npm run dev`
- If stale lock / broken dev state: `npm run dev:force`
- WebSocket gateway (separate terminal): `npm run gateway`
- Round worker (separate terminal): `npm run worker:round`
- Local frontend WS env (recommended): `NEXT_PUBLIC_WS_URL=ws://localhost:8081`
- Local fallback behavior: if `NEXT_PUBLIC_WS_URL` is unset and page host is `localhost`/`127.0.0.1`, browser client auto-uses `ws://localhost:${NEXT_PUBLIC_GATEWAY_PORT|8081}`.
- Optional worker debug logs: PowerShell ``$env:DEBUG_ROUND_LOOP="1"; npm run worker:round`` (or `set DEBUG_ROUND_LOOP=1 && npm run worker:round` in `cmd.exe`)
- Default local URLs:
  - App: `http://localhost:3000`
  - Gateway WS: `ws://localhost:8081`
- Minimal startup order for full game loop:
  - 0) `npm run dev:all`
  or
  - 1) `npm run dev`
  - 2) `npm run gateway`
  - 3) `npm run worker:round`
- Smoke check (gateway auth cookie required): `npx tsx scripts/ws_gateway_smoke.ts`
- Risk race smoke: `npm run test:risk-parallel`
- Queued risk smoke: `npm run test:risk-queued`
- House bankroll guard smoke: `npm run test:house-bankroll-guard`

## 8) UI Polish — BattleRoll-level Premium Dark Cosmic Aesthetic (2026-02-21)

### Summary
Full visual redesign of all client-side components to achieve a premium "wow" dark cosmic look while preserving 100% of game mechanics, API contracts, state management, and business logic.

### Brand palette v2 (hex values)
| Token | Hex | Usage |
|---|---|---|
| primary | `#651DCB` | CTA buttons, active states, gradient anchors |
| primarySoft | `#ECCCF9` | Badges, soft fills |
| accent | `#D761F1` | Secondary gradient stop, highlights |
| secondary | `#191E3B` | Card backgrounds, dark surface |
| surface | `#141A3A` | Base surface |
| surface-1 | `#1B2245` | Elevated cards |
| surface-2 | `#232B55` | Hover / interactive cards |
| bg-0 | `#0B0E1F` | Page background |
| bg-1 | `#101630` | Slightly lifted background |
| success | `#35D39B` | Win states, positive deltas |
| danger | `#FF4D6D` | Loss states, destructive actions |
| star | `#FDE182` | Star/gold highlights |
| flame | `#F48547` | Bronze/third place |
| text-primary | `#EAEDF6` | Main text |
| text-secondary | `#A3AECB` | Muted labels |
| text-tertiary | `#6B7A9E` | Disabled/hint text |

### Files changed (16 files, styling only)

| File | What changed |
|---|---|
| `theme/colors.ts` | Complete palette rewrite — new hex values, RGB channels, gradients, glass/glow/shadow tokens, `appColorCssVariables` |
| `app/globals.css` | Semantic token aliases, utility classes (`.glass-card`, `.btn-primary-glow`, `.glow-breathe`, `.bg-cosmic-radial`, `.card-depth`, `.focus-brand`), keyframes (`glowBreathe`, `fadeInUp`, `shimmer`), `prefers-reduced-motion` media query |
| `components/bottom-navigation.tsx` | Glass pill bar, active tab gradient + inset glow, `aria-current` accessibility |
| `components/top-hud.tsx` | Wallet button primary gradient + glow, avatar gradient ring |
| `components/top-panel.tsx` | Same as top-hud (wallet + avatar ring) |
| `components/staking-content.tsx` | Glass earnings card, branded CTA, surface-1 stat grid, redesigned leaderboard (gold/silver/bronze, top-3 glow rows) |
| `components/stat-cards.tsx` | Surface-1 glass cards, per-stat-type gradient icons |
| `components/profile-header.tsx` | Glass buttons, gradient avatar ring + glow, gradient level badge |
| `components/action-buttons.tsx` | Deposit primary gradient + glow, Withdraw glass surface |
| `components/achievements.tsx` | Unlocked: gradient + glow; Locked: dark surface |
| `components/referral-program.tsx` | Gradient border wrapper, glass inner card, gradient icon box, branded CTA |
| `components/settings-menu.tsx` | Surface-1 container, per-item gradient icons, tertiary chevron |
| `components/wallet-action-modal.tsx` | Glass overlay + surface-1 card with gradient overlay + shadow |
| `components/wallet-overview-modal.tsx` | Same glass overlay + card treatment |
| `components/particle-background.tsx` | Added `prefers-reduced-motion` early exit |
| `styles/place-bet-modal.module.css` | Submit button gradient + glow + border |
| `styles/staking-safe.module.css` | Glow colors from cyan → violet/pink brand |
| `app/page.tsx` | Root `bg-cosmic-radial` class, glass toast with `fadeInUp` animation |

### What was NOT changed (preserved exactly)
- All API routes, request/response contracts
- All game services, round/betting/settlement/fairness logic
- All state management (React state, WebSocket adapter, backend adapter)
- Prisma schema, migrations, DB queries
- Gateway server, auth, rate limiting
- Workers, reconciliation
- Component props interfaces and callback signatures
- Tab switching logic (`flushSync` + `requestAnimationFrame`)
- `LayoutGroup` animation (shared avatar between tabs)
- Currency formatting, balance display logic

### Accessibility
- All interactive elements maintain `focus-brand` ring (2px offset, brand color)
- AA contrast ratios maintained for all text on surface combinations
- `aria-current="page"` added to active nav tab
- `prefers-reduced-motion: reduce` disables all CSS animations/transitions AND canvas particle animation

### How to verify
1. `npm run build` — must compile with zero errors (verified ✅)
2. `npm run dev` — open in browser, check each tab:
   - **Staking tab**: glass earnings card, branded "Забрать" CTA with glow pulse, leaderboard with gold/silver/bronze rows
   - **Rush tab**: game screen unchanged (mechanics preserved), bet modal submit button has gradient + glow
   - **Profile tab**: gradient avatar ring, glass settings/QR buttons, gradient stat card icons, gradient level badge, gradient action buttons, glass referral card, branded settings menu icons
3. Toggle system to reduced-motion → confirm all animations stop
4. Check bottom nav pill → active tab has violet glow, smooth transitions
5. Check wallet modals → glass card overlay with blur backdrop

### Follow-up TODOs
- [ ] Replace inline `style={{...}}` objects with Tailwind v4 `@theme` tokens where possible (reduces bundle size, improves DX)
- [ ] Add dark/light mode toggle if product requires (current design is dark-only)
- [ ] Consider extracting glass-card / gradient-button as reusable shadcn-style components
- [ ] Profile staking-safe hero glow could be animated with CSS `@keyframes` for slow pulse effect
- [ ] Leaderboard should eventually be API-driven with real data and loading skeletons

## 9) UI Premium Refresh Execution Log (2026-02-20)

### Phase 1 - Design-system foundation (tokens + primitives)

#### What changed (files)
- `app/globals.css`
- `components/ui/glass-card.tsx`
- `components/ui/primary-button.tsx`
- `components/ui/secondary-button.tsx`
- `components/ui/stat-card.tsx`
- `components/ui/chip.tsx`
- `components/ui/bottom-nav-shell.tsx`

#### Why
- Moved to shadcn-style semantic token mapping with HSL-based design tokens and added required custom tokens for surfaces/glass/shadows/glows.
- Added reusable visual primitives so screen-level polish can be applied consistently without changing mechanics.
- Added safe-area CSS fallbacks (`--safe-*`, `--content-safe-*`) and reduced-motion protection as a baseline for Telegram Mini App UX.

#### How to test (exact steps + commands)
1. Run linter:
   - `npm run lint`
2. Run dev startup smoke check:
   - `npm run dev -- --hostname 127.0.0.1 --port 4011`
   - Note: in this automation environment, `npm run dev` is foreground-only (background process control is policy-blocked), so command was run with timeout as startup smoke.
3. Manual browser check (local):
   - Open `http://127.0.0.1:4011`
   - Verify app loads with the same behavior and no immediate style regressions.

#### Follow-ups / TODOs
- Apply new primitives to staking/profile/game screens and remove duplicated inline style blocks.
- Replace remaining direct `env(safe-area-inset-*)` usage with centralized safe-area vars.
- Tighten button/chip focus and disabled states on modal/game controls.

### Phase 2 - Staking/Profile/Nav visual pass (primitives applied)

#### What changed (files)
- `components/staking-content.tsx`
- `components/stat-cards.tsx`
- `components/action-buttons.tsx`
- `components/profile-header.tsx`
- `components/achievements.tsx`
- `components/referral-program.tsx`
- `components/settings-menu.tsx`
- `components/bottom-navigation.tsx`
- `components/top-hud.tsx`
- `app/page.tsx`
- `components/game/PlayersBetsList.tsx`
- `styles/place-bet-modal.module.css`
- `styles/starrush.module.css`

#### Why
- Applied shared primitives (`GlassCard`, `PrimaryButton`, `SecondaryButton`, `StatCard`, `BottomNavShell`) to remove one-off style blocks and create a cohesive premium look.
- Upgraded staking hierarchy (hero depth, earned row, stronger stat cards, cleaner leaderboard alignment/highlight).
- Upgraded profile hierarchy and inventory styling to feel premium instead of placeholder-level blocks.
- Added smoother bottom-nav active indicator and safe-area-aware fixed positioning.
- Ensured token migration compatibility where CSS used direct semantic variables now represented as HSL triples.

#### How to test (exact steps + commands)
1. Run linter:
   - `npm run lint`
2. Run dev startup smoke check:
   - `npm run dev -- --hostname 127.0.0.1 --port 4012`
   - In this automation environment the dev command is foreground-only and was timeout-bounded for startup smoke.
3. Manual checks (local browser):
   - Open app and inspect tab-by-tab:
     - `staking`: hero + earned row + two stat cards + leaderboard row hierarchy/top-1 highlight
     - `profile`: avatar/header, stat cards, inventory panel, referral block, menu rows
     - bottom nav: active indicator movement and safe-bottom spacing
   - Validate that tab switching, wallet opens, and existing callbacks still behave identically.

#### Follow-ups / TODOs
- Apply premium pass to bet bottom sheet controls/chips/tabs/loading states and game HUD CTA styling.
- Unify remaining modal styling (`wallet-action`, `wallet-overview`) with the same primitives.
- Verify reduced-motion behavior on framer transitions where CSS motion is already reduced.

### Phase 3 - Bet sheet + game HUD polish

#### What changed (files)
- `styles/place-bet-modal.module.css`
- `components/bets/PlaceBetModal.tsx`
- `styles/starrush.module.css`

#### Why
- Upgraded bet sheet to premium segmented tabs and stronger interaction states (focus ring, active quick chips, disabled/loading CTA state) without changing submit logic.
- Moved modal and game HUD safe-area math from direct `env(...)` to shared safe-area vars for Telegram/browser fallback consistency.
- Upgraded game CTA depth and glow behavior to match the premium visual direction while keeping glow controlled and reduced-motion-friendly.

#### How to test (exact steps + commands)
1. Run linter:
   - `npm run lint`
2. Run dev startup smoke check:
   - `npm run dev -- --hostname 127.0.0.1 --port 4013`
   - In this automation environment the dev command is foreground-only and timeout-bounded.
3. Manual checks (local browser):
   - Open Rush tab and verify:
     - main CTA has premium gradient + subtle breathing glow
     - CTA pressed/disabled state remains correct during submit/cashout
     - no overlap with bottom nav and safe-area paddings look correct
   - Open bet bottom sheet and verify:
     - tab segment indicator animates correctly
     - input focus ring visible
     - quick chips show active/pressed styling
     - submit button disabled/loading states are visually distinct
     - placing bet/cancel/close behavior remains identical.

#### Follow-ups / TODOs
- Consider moving wallet modals (`WalletActionModal`, `WalletOverviewModal`) to `GlassCard`/button primitives for full visual parity.
- Optional: unify remaining `--ui-*` style references in `styles/starrush.module.css` to pure semantic tokens to reduce token duplication.
- Run full manual Telegram Mini App smoke on a real device to confirm WebApp safe-area behavior with Telegram-provided insets.

## 10) UI polish pass - BattleRoll-like refinements (2026-02-20)

### What changed and why
- Profile stat cards: replaced mixed bitmap/blob icon treatment with cleaner outline icon system and unified sizing/alignment.
  - Why: previous icons looked noisy/cheap and inconsistent between cards.
- Referral "earned total": replaced plain text pattern (`TON / Stars`) with inline icon+value pairs (`TON icon + value`, `Star icon + value`).
  - Why: tighter baseline alignment and improved readability at a glance.
- Staking vault hero: re-layered vault as background art inside one hero card; earnings pill + CTA always foreground.
  - Why: fixed overlap/z-index conflicts and removed extra wrapper outline for cleaner composition.
- Bottom HUD/nav indicator: replaced old always-present stripe logic with shared-motion active pill + active underline only on current tab.
  - Why: removed stray line under "Стейкинг" and improved tab feedback quality.
- Page/tab transitions: switched to `AnimatePresence` (`mode="wait"`) and subtle slide/fade transitions per tab.
  - Why: smoother, premium navigation flow without changing screen mechanics.
- Reduced-motion behavior: wrapped animated UI in `MotionConfig reducedMotion="user"` and used reduced-motion-aware motion params.
  - Why: non-essential motion now scales down/turns off for accessibility.
- Chips/buttons/cards interactions: improved press/hover/lift transitions with token-based gradients/borders/shadows.
  - Why: stronger tactile quality while keeping effects lightweight for mobile.
- Game multiplier chips (history pills): changed from milky translucent style to darker glass + violet border + active gradient state.
  - Why: better palette match with StarRush and clearer selected/active states.
- Gradient button artifact fix: normalized gradient/background clipping across primary gradient buttons.
  - Why: removes left-side pink stripe artifact and keeps clean rounded gradients.
- Bet modal amount focus style: removed harsh focus ring; added subtle `focus-within` border/elevation treatment.
  - Why: cleaner look with keyboard-accessible focus visibility preserved.
- Top HUD positioning: converted from fixed overlay behavior to regular document flow (scrolls with content).
  - Why: matches requested behavior; only bottom nav remains fixed.

### Files touched
- `app/page.tsx`
- `app/globals.css`
- `components/top-hud.tsx`
- `components/bottom-navigation.tsx`
- `components/staking-content.tsx`
- `components/stat-cards.tsx`
- `components/referral-program.tsx`
- `components/game/StarRushPanel.tsx`
- `components/ui/stat-card.tsx`
- `components/ui/stat-icon.tsx` (new)
- `styles/staking-safe.module.css`
- `styles/place-bet-modal.module.css`
- `styles/starrush.module.css`

### How to test
1. Run checks:
   - `npm run lint`
   - `npm run build`
2. Start app:
   - `npm run dev`
3. Click-path validation:
   - Open app and go `Profile`:
     - Verify all 4 stat cards use clean, larger, aligned outline icons.
     - Verify referral "Заработано всего" uses inline TON/Star icon+value pattern.
   - Switch to `Staking`:
     - Verify top HUD is part of page flow and scrolls away with content.
     - Verify vault image stays behind earnings pill/`Забрать` CTA (no overlap).
     - Verify no extra nested outline/container around vault section.
   - Switch to `Game`:
     - Verify tab/page transition is smooth (subtle fade/slide).
     - Open bet modal, focus amount input:
       - Verify old ugly ring is gone.
       - Verify subtle focus-visible/focus-within highlight remains.
     - Verify chip styling is dark translucent + violet border with clear active state.
   - Switch tabs repeatedly (`Profile -> Staking -> Game -> Staking`):
     - Verify bottom nav active indicator slides smoothly.
     - Verify no stray inactive stripe under `Стейкинг`.
4. Accessibility sanity:
   - Enable OS/browser reduced motion.
   - Re-check tab/nav/button transitions are reduced/disabled appropriately.

### Follow-ups / TODOs
- Apply the same gradient artifact hardening to any remaining custom gradient buttons outside shared primitives.
- Consider extracting a shared "active chip" primitive for parity between modal quick chips and game history pills.
- Optional: add lightweight visual regression snapshots for nav indicator + staking hero layering to catch future UI regressions.
