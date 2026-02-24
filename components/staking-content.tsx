"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Trophy, Vault } from "lucide-react"

import { cn } from "@/lib/utils"
import { GlassCard } from "@/components/ui/glass-card"
import { PrimaryButton } from "@/components/ui/primary-button"
import { StatCard } from "@/components/ui/stat-card"
import { GlassSegmentedControl } from "@/components/ui/glass-segmented-control"

import styles from "@/styles/staking-safe.module.css"

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]
const STAKING_SORT_INDICATOR_SPRING = { type: "spring", stiffness: 360, damping: 34, mass: 0.85 } as const
const LEADERBOARD_LIMIT = 50

type LeaderboardSort = "gifts" | "ton" | "stars"

type LeaderboardEntry = {
  rank: number
  userId: string
  username: string | null
  displayName: string
  avatarUrl: string | null
  gifts: number
  tonBalance: string
  starsBalance: string
}

type LeaderboardApiResponse = {
  ok?: boolean
  error?: string
  leaderboard?: {
    sortBy: LeaderboardSort
    totalPlayers: number
    yourRank: number | null
    yourEntry: LeaderboardEntry | null
    items: LeaderboardEntry[]
  }
}

const SORT_OPTIONS: Array<{ id: LeaderboardSort; label: string }> = [
  { id: "gifts", label: "Подарки" },
  { id: "ton", label: "TON" },
  { id: "stars", label: "Stars" },
]

type StakingContentProps = {
  stakeAmountTon?: number
}

function formatTonAmount(value: number) {
  if (!Number.isFinite(value)) return "0.00"
  return Math.max(0, value).toFixed(2)
}

function rankColor(rank: number) {
  if (rank === 1) return "text-star"
  if (rank === 2) return "text-text-secondary"
  if (rank === 3) return "text-warning"
  return "text-text-tertiary"
}

function metricHeader(sortBy: LeaderboardSort) {
  if (sortBy === "ton") return "TON"
  if (sortBy === "stars") return "Stars"
  return "Подарки"
}

function metricValue(entry: LeaderboardEntry, sortBy: LeaderboardSort) {
  if (sortBy === "gifts") {
    return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(entry.gifts)
  }

  const source = sortBy === "ton" ? entry.tonBalance : entry.starsBalance
  const parsed = Number.parseFloat(source)
  const safe = Number.isFinite(parsed) ? Math.max(0, parsed) : 0
  return new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(safe)
}

function AvatarCell({ entry, isTop }: { entry: LeaderboardEntry; isTop: boolean }) {
  const [imageFailed, setImageFailed] = useState(false)
  const firstLetter = (entry.displayName.charAt(0) || "U").toUpperCase()
  const canRenderImage = Boolean(entry.avatarUrl) && !imageFailed

  return (
    <div
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border text-xs font-bold text-foreground",
        isTop
          ? "border-brand-soft/42 bg-gradient-to-br from-brand-1 to-brand-2"
          : "border-border/80 bg-gradient-to-br from-brand-1/45 to-brand-2/28",
      )}
    >
      {canRenderImage ? (
        <img
          src={entry.avatarUrl ?? ""}
          alt={entry.displayName}
          className="h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span>{firstLetter}</span>
      )}
    </div>
  )
}

export function StakingContent({ stakeAmountTon = 0 }: StakingContentProps) {
  const stakingAmountLabel = formatTonAmount(stakeAmountTon)
  const [sortBy, setSortBy] = useState<LeaderboardSort>("gifts")
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [totalPlayers, setTotalPlayers] = useState(0)
  const [yourRank, setYourRank] = useState<number | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isLeaderboardLoading, setLeaderboardLoading] = useState(true)
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null)
  const shouldReduceMotion = useReducedMotion()
  const sectionInitial = shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }
  const sectionAnimate = { opacity: 1, y: 0 }

  const activeSortLabel = useMemo(
    () => SORT_OPTIONS.find((option) => option.id === sortBy)?.label ?? "Подарки",
    [sortBy],
  )
  const sortItems = useMemo(
    () =>
      SORT_OPTIONS.map((option) => ({
        id: option.id,
        label: option.label,
      })),
    [],
  )

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    const fetchLeaderboard = async () => {
      setLeaderboardLoading(true)
      setLeaderboardError(null)

      try {
        const response = await fetch(`/api/staking/leaderboard?sortBy=${sortBy}&limit=${LEADERBOARD_LIMIT}`, {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        })

        const payload = (await response.json().catch(() => ({}))) as LeaderboardApiResponse
        if (!response.ok || payload.ok !== true || !payload.leaderboard) {
          throw new Error(payload.error || `HTTP_${response.status}`)
        }

        if (cancelled) return
        setLeaderboard(payload.leaderboard.items)
        setTotalPlayers(payload.leaderboard.totalPlayers)
        setYourRank(payload.leaderboard.yourRank)
        setCurrentUserId(payload.leaderboard.yourEntry?.userId ?? null)
      } catch (error: unknown) {
        if (cancelled || controller.signal.aborted) return
        setLeaderboard([])
        setTotalPlayers(0)
        setYourRank(null)
        setCurrentUserId(null)
        setLeaderboardError(error instanceof Error ? error.message : "LEADERBOARD_UNAVAILABLE")
      } finally {
        if (!cancelled) setLeaderboardLoading(false)
      }
    }

    void fetchLeaderboard()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [sortBy])

  return (
    <div className="px-[var(--page-px)] pb-2">
      <motion.div
        initial={sectionInitial}
        animate={sectionAnimate}
        transition={{ duration: shouldReduceMotion ? 0.1 : 0.2, ease: EASE }}
      >
        <GlassCard variant="hero" className={cn("mb-4 p-4 pb-3", styles.vaultCard)}>
          <div className={styles.safeHero} aria-hidden="true">
            <div className={styles.backGlow} />
            <div className={styles.leftGlow} />
            <div className={styles.rightGlow} />
            <div className={styles.safeFloat}>
              <Image
                src="/safe.png"
                alt=""
                fill
                className={styles.safeImage}
                sizes="(max-width: 640px) 80vw, 360px"
                priority
                loading="eager"
              />
            </div>
          </div>

          <div className={styles.vaultContent}>
            <div className="relative z-20 flex items-center justify-between rounded-2xl border border-border/80 bg-surface-2/88 p-3 shadow-[var(--shadow-sm)]">
              <div>
                <p className="mb-1 text-sm text-muted-foreground">Ты заработал:</p>
                <div className="flex items-center gap-2">
                  <img src="/ton.svg" alt="TON" className="h-5 w-5 rounded-full" />
                  <span className="text-base font-semibold text-foreground">{stakingAmountLabel} TON</span>
                </div>
              </div>
              <PrimaryButton breathing depth="raised" variant="brandSoft" className="h-10 min-w-28 rounded-xl px-5 text-sm">
                Забрать
              </PrimaryButton>
            </div>
          </div>
        </GlassCard>
      </motion.div>

      <motion.div
        className="mb-[var(--section-gap)] grid grid-cols-2 gap-[var(--card-gap)]"
        initial={sectionInitial}
        animate={sectionAnimate}
        transition={{ duration: shouldReduceMotion ? 0.1 : 0.2, ease: EASE, delay: shouldReduceMotion ? 0 : 0.03 }}
      >
        <StatCard
          icon={<Vault className="h-5 w-5 text-foreground" />}
          iconClassName="bg-gradient-to-br from-brand-1 to-brand-2"
          label="Твой стейкинг"
          value={`${stakingAmountLabel} TON`}
        />
        <StatCard
          icon={<Trophy className="h-5 w-5 text-foreground" />}
          iconClassName="bg-gradient-to-br from-brand-2 to-brand-1"
          label={`Твое место (${activeSortLabel})`}
          value={yourRank ? `${yourRank} место` : "—"}
        />
      </motion.div>

      <motion.div
        className="mb-[var(--section-gap)]"
        initial={sectionInitial}
        animate={sectionAnimate}
        transition={{ duration: shouldReduceMotion ? 0.1 : 0.2, ease: EASE, delay: shouldReduceMotion ? 0 : 0.06 }}
      >
        <div className={styles.leaderboardHeader}>
          <h2 className={styles.leaderboardTitle}>Лидерборд</h2>
          <GlassSegmentedControl
            items={sortItems}
            value={sortBy}
            onChange={(next) => setSortBy(next)}
            ariaLabel="Сортировка лидерборда"
            className={styles.sortSwitch}
            size="sm"
            layoutId="staking-sort-indicator"
            indicatorTransition={shouldReduceMotion ? { duration: 0.12 } : STAKING_SORT_INDICATOR_SPRING}
          />
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`leaderboard-${sortBy}`}
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={{ duration: shouldReduceMotion ? 0.1 : 0.2, ease: EASE }}
          >
            <GlassCard variant="elevated" className={cn("rounded-[var(--radius-xl)] p-2.5", styles.leaderboardCard)}>
          <div className={styles.leaderboardHeadRow}>
            <span>Место</span>
            <span>Игрок</span>
            <span className="text-right">{metricHeader(sortBy)}</span>
          </div>

          {isLeaderboardLoading ? (
            <div className={styles.leaderboardState}>Загрузка...</div>
          ) : null}

          {!isLeaderboardLoading && leaderboardError ? (
            <div className={styles.leaderboardState}>Лидерборд временно недоступен</div>
          ) : null}

          {!isLeaderboardLoading && !leaderboardError && leaderboard.length === 0 ? (
            <div className={styles.leaderboardState}>Пока нет игроков с балансом</div>
          ) : null}

          {!isLeaderboardLoading && !leaderboardError && leaderboard.length > 0 ? (
            <div className={styles.leaderboardList}>
              {leaderboard.map((entry, index) => {
                const isTop1 = entry.rank === 1
                const isTop3 = entry.rank <= 3
                const isCurrentUser = currentUserId !== null && currentUserId === entry.userId

                return (
                  <motion.div
                    key={`${entry.userId}-${entry.rank}-${sortBy}`}
                    initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: shouldReduceMotion ? 0.1 : 0.2,
                      delay: shouldReduceMotion ? 0 : 0.07 + index * 0.025,
                      ease: EASE,
                    }}
                    className={cn(
                      styles.leaderboardRow,
                      isTop1 && styles.leaderboardRowTop,
                      isTop3 && styles.leaderboardRowTop3,
                      isCurrentUser && styles.leaderboardRowCurrent,
                    )}
                  >
                    <div className={styles.rankCell}>
                      <span className={cn("text-lg font-extrabold tabular-nums", rankColor(entry.rank))}>
                        {entry.rank}
                      </span>
                    </div>

                    <div className={styles.playerCell}>
                      <AvatarCell entry={entry} isTop={isTop3} />
                      <span className={styles.playerName}>{entry.displayName}</span>
                    </div>

                    <div className={styles.metricCell}>{metricValue(entry, sortBy)}</div>
                  </motion.div>
                )
              })}
            </div>
          ) : null}
            </GlassCard>

            {!isLeaderboardLoading && !leaderboardError && totalPlayers > 0 ? (
              <p className={styles.leaderboardMeta}>Игроков в рейтинге: {totalPlayers}</p>
            ) : null}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
