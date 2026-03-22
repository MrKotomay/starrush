"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"

import {
  PlaceBetModal,
  type PlaceBetSubmitPayload,
} from "@/components/bets/PlaceBetModal"
import { CoefficientDisplay } from "@/components/game/CoefficientDisplay"
import { PlayersBetsList } from "@/components/game/PlayersBetsList"
import { Currency, PlayerBetView, RoundHistoryItem, RoundPhase, RoundSnapshot } from "@/game/types"
import { formatCurrencyAmount, isIntegerCurrency } from "@/lib/currency"
import { useI18n } from "@/lib/i18n"
import {
  cashOutUiSandboxRushBet,
  placeUiSandboxRushBet,
  useUiSandboxSnapshot,
} from "@/lib/ui-sandbox"
import styles from "@/styles/starrush.module.css"

const PREPARING_MS = 5000
const CRASHED_MS = 1400
const RESETTING_MS = 1800
const RUNNING_BET_WINDOW_MS = 1700
const ROUND_TICK_MS = 120
const ROUND_GROWTH_RATE = 0.11
const TOAST_VISIBLE_MS = 4800
const TOAST_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

const MIN_BET_BY_CURRENCY: Record<Currency, number> = {
  TON: 0.1,
  STARS: 1,
}

const MAX_BET_BY_CURRENCY: Record<Currency, number> = {
  TON: 1000,
  STARS: 1000,
}

const BOT_NAMES = [
  "Aurora",
  "Nebula",
  "Zenith",
  "Vortex",
  "Comet",
  "Orion",
  "Nova",
  "Pulsar",
]

type StarRushSandboxPanelProps = {
  initialTonBalance?: number
  initialStarsBalance?: number
  isActive?: boolean
  onOnlineCountChange?: (count: number) => void
  onWalletNeedsRefresh?: () => void
}

type ToastState = {
  id: number
  message: string
}

type DemoBotPlayer = PlayerBetView & {
  autoCashoutTarget: number | null
}

type DemoRoundRuntime = {
  roundId: string
  roundIndex: number
  phase: RoundPhase
  phaseStartedAt: number
  crashAt: number
  fairness: NonNullable<RoundSnapshot["fairness"]>
  history: RoundHistoryItem[]
  onlineCount: number
  players: DemoBotPlayer[]
  userBet: PlayerBetView | null
}

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min)
}

function makeFairness(roundIndex: number): NonNullable<RoundSnapshot["fairness"]> {
  return {
    serverSeedHash: `sandbox-hash-${roundIndex.toString(16)}-${Math.floor(randomBetween(1000, 9999)).toString(16)}`,
    serverSeed: `sandbox-seed-${roundIndex}-${Math.floor(randomBetween(10000, 99999))}`,
    fairnessVersion: "ui-sandbox-v1",
    fairnessNonce: roundIndex,
  }
}

function makeBotPlayers(roundId: string, roundIndex: number, placedAt: number): DemoBotPlayer[] {
  const playersCount = 5 + (roundIndex % 3)

  return Array.from({ length: playersCount }, (_, index) => {
    const currency: Currency = index % 3 === 0 ? "STARS" : "TON"
    const amount = currency === "TON"
      ? Number(randomBetween(0.25, 3.5).toFixed(2))
      : Math.max(1, Math.floor(randomBetween(10, 220)))
    const autoCashoutTarget =
      index % 4 === 0
        ? null
        : Number(randomBetween(1.2, 3.4 + roundIndex * 0.03).toFixed(2))

    return {
      id: `${roundId}-bot-${index + 1}`,
      userId: `ui-bot-${roundIndex}-${index + 1}`,
      username: BOT_NAMES[(roundIndex + index) % BOT_NAMES.length],
      amount,
      currency,
      status: "ACTIVE",
      isCurrentUser: false,
      visibleToCurrentUserOnly: false,
      placedAt: placedAt + index * 70,
      cashoutMultiplier: null,
      payout: null,
      autoCashoutAt: autoCashoutTarget,
      autoCashoutTarget,
    }
  })
}

function createRuntime(roundIndex: number, history: RoundHistoryItem[]): DemoRoundRuntime {
  const now = Date.now()
  const roundId = `ui-sandbox-round-${roundIndex}`

  return {
    roundId,
    roundIndex,
    phase: RoundPhase.PREPARING,
    phaseStartedAt: now,
    crashAt: Number(randomBetween(1.45, 6.4).toFixed(2)),
    fairness: makeFairness(roundIndex),
    history,
    onlineCount: Math.floor(randomBetween(42, 74)),
    players: makeBotPlayers(roundId, roundIndex, now),
    userBet: null,
  }
}

function computeRunningCoefficient(elapsedMs: number) {
  const seconds = Math.max(0, elapsedMs) / 1000
  const raw = Math.exp(ROUND_GROWTH_RATE * seconds)
  return Number(Math.max(1, raw).toFixed(4))
}

function toHistoryEntry(runtime: DemoRoundRuntime, timestamp: number): RoundHistoryItem {
  return {
    roundId: runtime.roundId,
    crashAt: runtime.crashAt,
    timestamp,
    serverSeedHash: runtime.fairness.serverSeedHash,
    serverSeed: runtime.fairness.serverSeed,
    fairnessVersion: runtime.fairness.fairnessVersion,
    fairnessNonce: runtime.fairness.fairnessNonce,
  }
}

function historyPillClass(crashAt: number, isFirst: boolean): string {
  if (isFirst) return `${styles.historyPill} ${styles.historyPillFirst}`
  if (crashAt < 1.6) return `${styles.historyPill} ${styles.historyLow}`
  if (crashAt < 3.2) return `${styles.historyPill} ${styles.historyMid}`
  return `${styles.historyPill} ${styles.historyHigh}`
}

function createSnapshotFromRuntime(runtime: DemoRoundRuntime, now: number): RoundSnapshot {
  const phaseElapsedMs = Math.max(0, now - runtime.phaseStartedAt)
  const coefficient =
    runtime.phase === RoundPhase.RUNNING
      ? Math.min(runtime.crashAt, computeRunningCoefficient(phaseElapsedMs))
      : 1

  return {
    phase: runtime.phase,
    roundId: runtime.roundId,
    roundIndex: runtime.roundIndex,
    onlineCount: runtime.onlineCount,
    coefficient,
    crashAt: runtime.crashAt,
    countdown:
      runtime.phase === RoundPhase.PREPARING
        ? Math.max(0, Math.ceil((PREPARING_MS - phaseElapsedMs) / 1000))
        : 0,
    runningElapsedMs: runtime.phase === RoundPhase.RUNNING ? phaseElapsedMs : 0,
    phaseElapsedMs,
    history: runtime.history,
    fairness: runtime.fairness,
    players: [...runtime.players, ...(runtime.userBet ? [runtime.userBet] : [])],
    queuedBet: null,
    userActiveBet: runtime.userBet,
    canPlaceBet:
      runtime.phase === RoundPhase.PREPARING ||
      (runtime.phase === RoundPhase.RUNNING && phaseElapsedMs < RUNNING_BET_WINDOW_MS),
    canCashOut: runtime.phase === RoundPhase.RUNNING && runtime.userBet?.status === "ACTIVE",
  }
}

export function StarRushSandboxPanel({
  isActive = true,
  onOnlineCountChange,
  onWalletNeedsRefresh,
}: StarRushSandboxPanelProps) {
  const { t } = useI18n()
  const uiSandboxSnapshot = useUiSandboxSnapshot()
  const panelRootRef = useRef<HTMLDivElement | null>(null)
  const runtimeRef = useRef<DemoRoundRuntime>(createRuntime(1, []))
  const coefficientRef = useRef(1)
  const toastIdRef = useRef(0)

  const [snapshot, setSnapshot] = useState<RoundSnapshot>(() => {
    const nextSnapshot = createSnapshotFromRuntime(runtimeRef.current, Date.now())
    coefficientRef.current = nextSnapshot.coefficient
    return nextSnapshot
  })
  const [panelAnchorRect, setPanelAnchorRect] = useState<{ left: number; width: number } | null>(null)
  const [isPlaceModalOpen, setPlaceModalOpen] = useState(false)
  const [isBetSubmitting, setBetSubmitting] = useState(false)
  const [isCashoutSubmitting, setCashoutSubmitting] = useState(false)
  const [toast, setToast] = useState<ToastState | null>(null)

  const tonWallet = uiSandboxSnapshot.wallets.find((wallet) => wallet.currency === "TON")
  const starsWallet = uiSandboxSnapshot.wallets.find((wallet) => wallet.currency === "STARS")
  const tonAvailableBalance = Number.parseFloat(tonWallet?.balance ?? "0")
  const starsAvailableBalance = Number.parseFloat(starsWallet?.balance ?? "0")

  const syncSnapshot = useCallback((now = Date.now()) => {
    const nextSnapshot = createSnapshotFromRuntime(runtimeRef.current, now)
    coefficientRef.current = nextSnapshot.coefficient
    setSnapshot(nextSnapshot)
  }, [])

  const showToast = useCallback((message: string) => {
    const trimmed = message.trim()
    if (!trimmed) return
    toastIdRef.current += 1
    setToast({ id: toastIdRef.current, message: trimmed })
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), TOAST_VISIBLE_MS)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    const panel = panelRootRef.current
    if (!panel) return

    const updateRect = () => {
      const rect = panel.getBoundingClientRect()
      if (rect.width <= 0) return
      setPanelAnchorRect({ left: Math.round(rect.left), width: Math.round(rect.width) })
    }

    updateRect()

    const observer = new ResizeObserver(updateRect)
    observer.observe(panel)
    window.addEventListener("resize", updateRect, { passive: true })
    window.addEventListener("scroll", updateRect, { passive: true })

    return () => {
      observer.disconnect()
      window.removeEventListener("resize", updateRect)
      window.removeEventListener("scroll", updateRect)
    }
  }, [])

  useEffect(() => {
    if (typeof document === "undefined") return undefined

    const tick = () => {
      if (document.hidden || !isActive) return

      const now = Date.now()
      const runtime = runtimeRef.current
      const phaseElapsedMs = Math.max(0, now - runtime.phaseStartedAt)

      if (runtime.phase === RoundPhase.PREPARING && phaseElapsedMs >= PREPARING_MS) {
        runtime.phase = RoundPhase.RUNNING
        runtime.phaseStartedAt = now
      } else if (runtime.phase === RoundPhase.RUNNING) {
        const coefficient = Math.min(runtime.crashAt, computeRunningCoefficient(phaseElapsedMs))

        runtime.players = runtime.players.map((player) => {
          if (player.status !== "ACTIVE") return player
          if (player.autoCashoutTarget !== null && coefficient >= player.autoCashoutTarget) {
            return {
              ...player,
              status: "CASHED_OUT",
              cashoutMultiplier: player.autoCashoutTarget,
              payout: Number((player.amount * player.autoCashoutTarget).toFixed(2)),
            }
          }
          return player
        })

        if (coefficient >= runtime.crashAt) {
          runtime.phase = RoundPhase.CRASHED
          runtime.phaseStartedAt = now
          runtime.players = runtime.players.map((player) =>
            player.status === "ACTIVE"
              ? {
                  ...player,
                  status: "LOST",
                  payout: 0,
                }
              : player,
          )

          if (runtime.userBet?.status === "ACTIVE") {
            runtime.userBet = {
              ...runtime.userBet,
              status: "LOST",
              payout: 0,
            }
          }

          runtime.history = [toHistoryEntry(runtime, now), ...runtime.history].slice(0, 6)
        }
      } else if (runtime.phase === RoundPhase.CRASHED && phaseElapsedMs >= CRASHED_MS) {
        runtime.phase = RoundPhase.RESETTING
        runtime.phaseStartedAt = now
      } else if (runtime.phase === RoundPhase.RESETTING && phaseElapsedMs >= RESETTING_MS) {
        runtimeRef.current = createRuntime(runtime.roundIndex + 1, runtime.history)
      }

      syncSnapshot(now)
    }

    syncSnapshot()
    const timer = window.setInterval(tick, ROUND_TICK_MS)
    return () => window.clearInterval(timer)
  }, [isActive, syncSnapshot])

  useEffect(() => {
    onOnlineCountChange?.(snapshot.onlineCount)
  }, [onOnlineCountChange, snapshot.onlineCount])

  const placeBetAmount = useCallback(
    async (rawBetAmount: number, currency: Currency) => {
      if (isBetSubmitting || isCashoutSubmitting) return false
      if (!snapshot.canPlaceBet) {
        showToast(t("rush.error.roundNotAccepting"))
        return false
      }
      if (runtimeRef.current.userBet?.status === "ACTIVE") {
        showToast(t("rush.error.alreadyBet"))
        return false
      }

      const amount = isIntegerCurrency(currency)
        ? Math.round(Math.max(0, rawBetAmount))
        : Math.round(Math.max(0, rawBetAmount) * 100) / 100
      const minBet = MIN_BET_BY_CURRENCY[currency]
      const maxBet = MAX_BET_BY_CURRENCY[currency]

      if (!Number.isFinite(amount) || amount < minBet || amount > maxBet) {
        showToast(t("rush.betLimit", { min: minBet, max: maxBet }))
        return false
      }

      setBetSubmitting(true)
      try {
        const result = placeUiSandboxRushBet({ amount, currency })
        if (!result.ok) {
          showToast(
            result.error === "INSUFFICIENT_BALANCE"
              ? t("rush.error.insufficientBalance")
              : t("rush.error.betFailed"),
          )
          return false
        }

        runtimeRef.current.userBet = {
          id: `${runtimeRef.current.roundId}-user-bet`,
          userId: uiSandboxSnapshot.dbUser.id,
          username: uiSandboxSnapshot.mockUser.username ?? t("rush.players.you"),
          amount,
          currency,
          status: "ACTIVE",
          isCurrentUser: true,
          visibleToCurrentUserOnly: false,
          placedAt: Date.now(),
          cashoutMultiplier: null,
          payout: null,
          autoCashoutAt: null,
        }
        syncSnapshot()
        onWalletNeedsRefresh?.()
        return true
      } finally {
        setBetSubmitting(false)
      }
    },
    [isBetSubmitting, isCashoutSubmitting, onWalletNeedsRefresh, showToast, snapshot.canPlaceBet, syncSnapshot, t, uiSandboxSnapshot],
  )

  const onCashOut = useCallback(async () => {
    if (isCashoutSubmitting || isBetSubmitting) return

    const runtime = runtimeRef.current
    const activeBet = runtime.userBet
    if (!activeBet || activeBet.status !== "ACTIVE" || runtime.phase !== RoundPhase.RUNNING) {
      showToast(t("rush.error.activeBetNotFound"))
      return
    }

    setCashoutSubmitting(true)
    try {
      const multiplier = Math.max(1, coefficientRef.current)
      const payout = activeBet.amount * multiplier
      const result = cashOutUiSandboxRushBet({
        payout,
        currency: activeBet.currency,
      })

      if (!result.ok) {
        showToast(t("rush.error.cashoutFailed"))
        return
      }

      runtime.userBet = {
        ...activeBet,
        status: "CASHED_OUT",
        cashoutMultiplier: multiplier,
        payout: Number(payout.toFixed(2)),
      }
      syncSnapshot()
      onWalletNeedsRefresh?.()
      showToast(
        t("rush.cashoutToast", {
          payout: formatCurrencyAmount(activeBet.currency, payout, { compactStars: false }),
          multiplier: multiplier.toFixed(2),
          currency: activeBet.currency,
        }),
      )
    } finally {
      setCashoutSubmitting(false)
    }
  }, [isBetSubmitting, isCashoutSubmitting, onWalletNeedsRefresh, showToast, syncSnapshot, t])

  const onPlaceFromModal = useCallback(
    async (payload: PlaceBetSubmitPayload) => {
      if (payload.tab === "GIFTS") {
        showToast(t("placeBet.emptyInventory"))
        return
      }

      const accepted = await placeBetAmount(
        Math.max(0, payload.amount),
        payload.tab === "STARS" ? "STARS" : "TON",
      )
      if (!accepted) return
      setPlaceModalOpen(false)
    },
    [placeBetAmount, showToast, t],
  )

  const activeBet = snapshot.userActiveBet?.status === "ACTIVE" ? snapshot.userActiveBet : null
  const canCashOutNow = snapshot.phase === RoundPhase.RUNNING && snapshot.canCashOut && !!activeBet
  const isActionBusy = isBetSubmitting || isCashoutSubmitting
  const cashoutAmount = activeBet ? activeBet.amount * coefficientRef.current : 0
  const activeBetCurrency = activeBet?.currency ?? "TON"
  const ctaStateClass = canCashOutNow
    ? styles.btnStateCashout
    : isActionBusy
      ? styles.btnStateSubmitting
      : styles.btnStateBetReady
  const mainBetLabel = isActionBusy
    ? t("rush.submit")
    : canCashOutNow
      ? t("rush.cashout", {
          amount: formatCurrencyAmount(activeBetCurrency, cashoutAmount, { compactStars: false }),
          currency: activeBetCurrency,
        })
      : t("rush.bet")

  const currentHistoryLabel =
    snapshot.phase === RoundPhase.PREPARING
      ? `${Math.max(snapshot.countdown, 0)}s`
      : snapshot.phase === RoundPhase.RUNNING
        ? `x${snapshot.coefficient.toFixed(2)}`
        : `x${snapshot.crashAt.toFixed(2)}`
  const currentHistoryClass =
    snapshot.phase === RoundPhase.PREPARING
      ? styles.historyPillWaiting
      : snapshot.phase === RoundPhase.RUNNING
        ? styles.historyPillLive
        : snapshot.phase === RoundPhase.CRASHED
          ? styles.historyPillCrash
          : styles.historyPillSettling

  return (
    <div ref={panelRootRef} className={styles.panelRoot}>
      <div className={styles.gameArea}>
        <div className={styles.phaserMount}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(130,88,255,0.22),transparent_24%),radial-gradient(circle_at_50%_72%,rgba(255,255,255,0.08),transparent_18%),linear-gradient(180deg,rgba(9,14,33,0.08)_0%,rgba(9,14,33,0.34)_100%)]" />
          <div className="absolute left-1/2 top-[66%] h-40 w-40 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(213,118,255,0.24)_0%,rgba(213,118,255,0)_72%)] blur-3xl" />
          <div className="absolute inset-x-[18%] top-[24%] h-px bg-white/10 shadow-[0_0_32px_rgba(255,255,255,0.18)]" />
        </div>

        <div className={styles.coeffOverlay}>
          <CoefficientDisplay
            phase={snapshot.phase}
            coefficient={snapshot.coefficient}
            crashAt={snapshot.crashAt}
            countdown={snapshot.countdown}
          />
        </div>

        <div className={styles.historyRow}>
          <div className={styles.historyRail}>
            <div className={styles.historyPillWrap}>
              <span className={`${styles.historyPill} ${styles.historyPillFirst} ${currentHistoryClass}`}>
                {currentHistoryLabel}
              </span>
            </div>

            {snapshot.history.map((item) => (
              <div key={item.roundId} className={styles.historyPillWrap}>
                <span className={historyPillClass(item.crashAt, false)}>{`x${item.crashAt.toFixed(2)}`}</span>
              </div>
            ))}
          </div>
        </div>

        <section className={styles.betSection}>
          <div className={styles.betDock}>
            <button
              type="button"
              className={`${styles.actionButton} ${ctaStateClass} liquid-sheen`}
              disabled={isActionBusy}
              data-sheen={isActionBusy ? "off" : "event"}
              onClick={() => {
                if (canCashOutNow) {
                  void onCashOut()
                  return
                }
                setPlaceModalOpen(true)
              }}
            >
              {mainBetLabel}
            </button>
          </div>
        </section>
      </div>

      <PlayersBetsList
        players={snapshot.players}
        queuedBet={snapshot.queuedBet}
        phase={snapshot.phase}
        getLiveCoefficient={() => coefficientRef.current}
      />

      <PlaceBetModal
        open={isPlaceModalOpen}
        defaultTonAmount={1}
        currentPhase={snapshot.phase}
        tonAvailable={tonAvailableBalance}
        starsAvailable={starsAvailableBalance}
        anchorRect={panelAnchorRect}
        isSubmitting={isBetSubmitting}
        onOpenChange={(open) => {
          if (isBetSubmitting) return
          setPlaceModalOpen(open)
        }}
        onSubmit={onPlaceFromModal}
      />

      <AnimatePresence mode="wait" initial={false}>
        {toast ? (
          <div className={styles.toastLayer}>
            <motion.div
              key={toast.id}
              className={styles.toastMotion}
              initial={{ opacity: 0, y: -18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -14, scale: 0.985 }}
              transition={{ duration: 0.24, ease: TOAST_EASE }}
            >
              <div className={styles.toast}>{toast.message}</div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
