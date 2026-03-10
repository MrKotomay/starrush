"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Image from "next/image"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Trophy, Vault } from "lucide-react"

import { StakingActionModal } from "@/components/staking-action-modal"
import { GlassSegmentedControl } from "@/components/ui/glass-segmented-control"
import { GlassCard } from "@/components/ui/glass-card"
import { PrimaryButton } from "@/components/ui/primary-button"
import { StatCard } from "@/components/ui/stat-card"
import { formatCurrencyAmount } from "@/lib/currency"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

import styles from "@/styles/staking-safe.module.css"

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]
const STAKING_SORT_INDICATOR_MOTION = {
  type: "spring",
  stiffness: 500,
  damping: 36,
  mass: 0.7,
} as const
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

type StakingAssetView = {
  assetId: "TON" | "STARS"
  assetType: "TON" | "STARS" | "GIFT"
  symbol: string
  icon: string
  walletBalance: string
  stakedPrincipal: string
  pendingReward: string
  claimableReward: string
  aprBps: number
  minStake: string
  canStake: boolean
  canClaim: boolean
  canUnstake: boolean
  pendingUnstake: {
    id: string
    amount: string
    status: string
    availableAt: string
    createdAt: string
  } | null
}

type StakingOverviewApiResponse = {
  ok?: boolean
  error?: string
  assets?: StakingAssetView[]
}

type StakingActionApiResponse = {
  ok?: boolean
  error?: string
  claimedAmount?: string
  asset?: StakingAssetView
}

const SORT_OPTIONS: Array<{ id: LeaderboardSort; labelKey: string }> = [
  { id: "gifts", labelKey: "staking.gifts" },
  { id: "ton", labelKey: "common.ton" },
  { id: "stars", labelKey: "common.stars" },
]

function toNumber(value: string | number | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function formatApr(aprBps: number) {
  return `${(aprBps / 100).toFixed(2)}%`
}

function rankColor(rank: number) {
  if (rank === 1) return "text-star"
  if (rank === 2) return "text-text-secondary"
  if (rank === 3) return "text-warning"
  return "text-text-tertiary"
}

function metricHeader(
  sortBy: LeaderboardSort,
  t: (key: string, vars?: Record<string, string | number>) => string,
) {
  if (sortBy === "ton") return t("common.ton")
  if (sortBy === "stars") return t("common.stars")
  return t("staking.gifts")
}

function metricValue(
  entry: LeaderboardEntry,
  sortBy: LeaderboardSort,
  locale: string,
) {
  if (sortBy === "gifts") {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(entry.gifts)
  }

  const source = sortBy === "ton" ? entry.tonBalance : entry.starsBalance
  const parsed = Number.parseFloat(source)
  const safe = Number.isFinite(parsed) ? Math.max(0, parsed) : 0
  return sortBy === "ton"
    ? new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(safe)
    : new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.floor(safe))
}

function formatAssetLabel(asset: StakingAssetView) {
  return asset.assetId === "TON"
    ? formatCurrencyAmount("TON", toNumber(asset.stakedPrincipal), { compactStars: false })
    : formatCurrencyAmount("STARS", toNumber(asset.stakedPrincipal), { compactStars: false })
}

function formatAssetAmount(assetId: "TON" | "STARS", value: string | number) {
  return formatCurrencyAmount(assetId, toNumber(value), { compactStars: false })
}

function AssetInlineSummary({
  assets,
  field,
}: {
  assets: StakingAssetView[]
  field: "stakedPrincipal" | "claimableReward"
}) {
  const sourceAssets =
    assets.length > 0
      ? assets
      : [
          { assetId: "TON", icon: "/ton.svg", symbol: "TON", value: "0" },
          { assetId: "STARS", icon: "/stars.svg", symbol: "Stars", value: "0" },
        ]

  return (
    <span className={styles.inlineSummary}>
      {sourceAssets.map((asset) => {
        const amount =
          "value" in asset
            ? asset.value
            : formatCurrencyAmount(asset.assetId, toNumber(asset[field]), { compactStars: false })

        return (
          <span key={asset.assetId} className={styles.inlineSummaryItem}>
            <img src={asset.icon} alt={asset.symbol} className={styles.inlineSummaryIcon} />
            <span>{amount}</span>
          </span>
        )
      })}
    </span>
  )
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

function mergeAsset(
  assets: StakingAssetView[],
  nextAsset: StakingAssetView,
) {
  if (!assets.some((asset) => asset.assetId === nextAsset.assetId)) {
    return [...assets, nextAsset]
  }
  return assets.map((asset) => (asset.assetId === nextAsset.assetId ? nextAsset : asset))
}

export function StakingContent() {
  const { t, intlLocale, formatDateTime } = useI18n()
  const [sortBy, setSortBy] = useState<LeaderboardSort>("ton")
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [totalPlayers, setTotalPlayers] = useState(0)
  const [yourRank, setYourRank] = useState<number | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isLeaderboardLoading, setLeaderboardLoading] = useState(true)
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null)
  const [assets, setAssets] = useState<StakingAssetView[]>([])
  const [selectedAssetId, setSelectedAssetId] = useState<"TON" | "STARS">("TON")
  const [isAssetPanelOpen, setAssetPanelOpen] = useState(false)
  const [isOverviewLoading, setOverviewLoading] = useState(true)
  const [overviewError, setOverviewError] = useState<string | null>(null)
  const [actionState, setActionState] = useState<{ mode: "stake" | "unstake"; asset: StakingAssetView } | null>(null)
  const [isActionSubmitting, setActionSubmitting] = useState(false)
  const [claimingAssetId, setClaimingAssetId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const shouldReduceMotion = useReducedMotion()
  const sectionInitial = shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }
  const sectionAnimate = { opacity: 1, y: 0 }

  const activeSortLabel = useMemo(() => {
    const key = SORT_OPTIONS.find((option) => option.id === sortBy)?.labelKey ?? "common.ton"
    return t(key)
  }, [sortBy, t])

  const sortItems = useMemo(
    () =>
      SORT_OPTIONS.map((option) => ({
        id: option.id,
        label: t(option.labelKey),
      })),
    [t],
  )

  const claimableAssets = useMemo(() => assets.filter((asset) => asset.canClaim), [assets])
  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.assetId === selectedAssetId) ?? assets[0] ?? null,
    [assets, selectedAssetId],
  )

  useEffect(() => {
    if (assets.length === 0) return
    if (!assets.some((asset) => asset.assetId === selectedAssetId)) {
      setSelectedAssetId(assets[0].assetId)
    }
  }, [assets, selectedAssetId])

  const mapStakingError = useCallback(
    (code?: string) => {
      switch (code) {
        case "RATE_LIMIT":
          return t("staking.error.rateLimit")
        case "INVALID_INPUT":
        case "INVALID_AMOUNT":
          return t("staking.error.invalidAmount")
        case "INTEGER_AMOUNT_REQUIRED":
          return t("staking.error.integerRequired")
        case "MIN_STAKE_NOT_REACHED":
          return t("staking.error.minStake")
        case "POOL_DISABLED":
          return t("staking.error.poolDisabled")
        case "INSUFFICIENT_BALANCE":
          return t("staking.error.insufficientBalance")
        case "INSUFFICIENT_STAKED_BALANCE":
          return t("staking.error.insufficientStaked")
        case "PENDING_UNSTAKE_EXISTS":
          return t("staking.error.pendingUnstake")
        case "REWARD_RESERVE_EXHAUSTED":
          return t("staking.error.reserve")
        case "POOL_NOT_FOUND":
          return t("staking.error.unavailable")
        default:
          return t("staking.error.generic")
      }
    },
    [t],
  )

  const refreshOverview = useCallback(async () => {
    setOverviewLoading(true)
    setOverviewError(null)

    try {
      const response = await fetch("/api/staking/overview", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json" },
      })

      const payload = (await response.json().catch(() => ({}))) as StakingOverviewApiResponse
      if (!response.ok || payload.ok !== true || !Array.isArray(payload.assets)) {
        throw new Error(payload.error || "STAKING_UNAVAILABLE")
      }

      setAssets(payload.assets)
    } catch (error: unknown) {
      setAssets([])
      setOverviewError(error instanceof Error ? error.message : "STAKING_UNAVAILABLE")
    } finally {
      setOverviewLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshOverview()
  }, [refreshOverview])

  useEffect(() => {
    const interval = window.setInterval(() => {
      void refreshOverview()
    }, 15000)

    return () => window.clearInterval(interval)
  }, [refreshOverview])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 2600)
    return () => window.clearTimeout(timer)
  }, [toast])

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

  const handleClaim = useCallback(
    async (asset: StakingAssetView) => {
      setClaimingAssetId(asset.assetId)
      try {
        const response = await fetch("/api/staking/claim", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ assetId: asset.assetId }),
        })

        const payload = (await response.json().catch(() => ({}))) as StakingActionApiResponse
        if (!response.ok || payload.ok !== true || !payload.asset) {
          setToast(mapStakingError(payload.error))
          return
        }

        setAssets((current) => mergeAsset(current, payload.asset!))
        const claimedAmount = Number.parseFloat(payload.claimedAmount ?? "0")
        if (claimedAmount > 0) {
          setToast(
            t("staking.claimed", {
              amount: formatCurrencyAmount(asset.assetId, claimedAmount, { compactStars: false }),
              asset: asset.symbol,
            }),
          )
        } else {
          setToast(t("staking.nothingToClaim"))
        }
      } finally {
        setClaimingAssetId(null)
      }
    },
    [mapStakingError, t],
  )

  const handleClaimAll = useCallback(async () => {
    for (const asset of claimableAssets) {
      // Run sequentially to preserve wallet/overview consistency.
      await handleClaim(asset)
    }
  }, [claimableAssets, handleClaim])

  const handleActionSubmit = useCallback(
    async ({ amount }: { amount: number }) => {
      if (!actionState) return
      setActionSubmitting(true)
      try {
        const endpoint = actionState.mode === "stake" ? "/api/staking/stake" : "/api/staking/unstake"
        const response = await fetch(endpoint, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            assetId: actionState.asset.assetId,
            amount,
          }),
        })

        const payload = (await response.json().catch(() => ({}))) as StakingActionApiResponse
        if (!response.ok || payload.ok !== true || !payload.asset) {
          setToast(mapStakingError(payload.error))
          return
        }

        setAssets((current) => mergeAsset(current, payload.asset!))
        setActionState(null)
        setToast(
          actionState.mode === "stake"
            ? t("staking.stakedSuccess", {
                amount: formatCurrencyAmount(actionState.asset.assetId, amount, { compactStars: false }),
                asset: actionState.asset.symbol,
              })
            : t("staking.unstakeRequested", {
                amount: formatCurrencyAmount(actionState.asset.assetId, amount, { compactStars: false }),
                asset: actionState.asset.symbol,
              }),
        )
      } finally {
        setActionSubmitting(false)
      }
    },
    [actionState, mapStakingError, t],
  )

  return (
    <div className="px-[var(--page-px)] pb-2">
      <motion.div
        initial={sectionInitial}
        animate={sectionAnimate}
        transition={{ duration: shouldReduceMotion ? 0.1 : 0.2, ease: EASE }}
      >
        <GlassCard variant="hero" className={cn("mb-5 p-4 pb-4", styles.vaultCard)}>
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
            <div className={styles.claimStrip}>
              <div className={styles.claimMeta}>
                <p className="mb-1 text-[0.78rem] font-medium text-muted-foreground">{t("staking.youEarned")}</p>
                <div className="flex flex-col gap-1">
                  <span className={styles.claimValue}>
                    <AssetInlineSummary assets={assets} field="claimableReward" />
                  </span>
                  <span className={styles.claimTotalRow}>
                    {t("staking.totalStaked")}: <AssetInlineSummary assets={assets} field="stakedPrincipal" />
                  </span>
                </div>
              </div>
              <div className={styles.claimActions}>
                <button
                  type="button"
                  className={styles.manageButton}
                  disabled={isOverviewLoading || assets.length === 0}
                  onClick={() => setAssetPanelOpen((current) => !current)}
                >
                  {t("common.staking")}
                </button>
                <PrimaryButton
                  depth="raised"
                  variant="brand"
                  data-sheen="event"
                  className={styles.claimButton}
                  disabled={claimableAssets.length === 0 || claimingAssetId !== null}
                  onClick={() => {
                    void handleClaimAll()
                  }}
                >
                  {claimingAssetId ? t("common.processing") : t("staking.claim")}
                </PrimaryButton>
              </div>
            </div>

            <AnimatePresence initial={false}>
              {isAssetPanelOpen && !isOverviewLoading && !overviewError && selectedAsset ? (
                <motion.div
                  key="staking-asset-panel"
                  className={styles.assetPanel}
                  initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 18, height: 0 }}
                  animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, height: "auto" }}
                  exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, height: 0 }}
                  transition={{ duration: shouldReduceMotion ? 0.12 : 0.24, ease: EASE }}
                >
                  <div className={styles.assetPanelTabs}>
                    {assets.map((asset) => {
                      const isActive = asset.assetId === selectedAsset.assetId
                      return (
                        <button
                          key={asset.assetId}
                          type="button"
                          className={cn(styles.assetPanelTab, isActive && styles.assetPanelTabActive)}
                          onClick={() => setSelectedAssetId(asset.assetId)}
                        >
                          <img src={asset.icon} alt={asset.symbol} className={styles.assetPanelTabIcon} />
                          <span>{asset.symbol}</span>
                          <span className={styles.assetPanelTabAmount}>
                            {formatAssetAmount(asset.assetId, asset.stakedPrincipal)}
                          </span>
                        </button>
                      )
                    })}
                  </div>

                  <div className={styles.assetPanelCard}>
                    <div className={styles.assetPanelHeader}>
                      <div className={styles.assetTitleWrap}>
                        <span className={styles.assetIconWrap}>
                          <img src={selectedAsset.icon} alt={selectedAsset.symbol} className={styles.assetIcon} />
                        </span>
                        <div>
                          <div className={styles.assetTitle}>{selectedAsset.symbol}</div>
                          <div className={styles.assetSubtitle}>{t("staking.apr")}: {formatApr(selectedAsset.aprBps)}</div>
                        </div>
                      </div>
                      {selectedAsset.pendingUnstake ? (
                        <span className={styles.pendingBadge}>{t("staking.pendingUnstake")}</span>
                      ) : null}
                    </div>

                    <div className={styles.assetPanelMetrics}>
                      <div className={styles.assetMetric}>
                        <div className={styles.assetMetricLabel}>{t("staking.walletBalance")}</div>
                        <div className={styles.assetMetricValue}>
                          {formatAssetAmount(selectedAsset.assetId, selectedAsset.walletBalance)} {selectedAsset.symbol}
                        </div>
                      </div>
                      <div className={styles.assetMetric}>
                        <div className={styles.assetMetricLabel}>{t("staking.stakedBalance")}</div>
                        <div className={styles.assetMetricValue}>
                          {formatAssetAmount(selectedAsset.assetId, selectedAsset.stakedPrincipal)} {selectedAsset.symbol}
                        </div>
                      </div>
                      <div className={styles.assetMetric}>
                        <div className={styles.assetMetricLabel}>{t("staking.pendingReward")}</div>
                        <div className={styles.assetMetricValue}>
                          {formatAssetAmount(selectedAsset.assetId, selectedAsset.pendingReward)} {selectedAsset.symbol}
                        </div>
                      </div>
                      <div className={styles.assetMetric}>
                        <div className={styles.assetMetricLabel}>
                          {selectedAsset.pendingUnstake ? t("staking.cooldown") : t("staking.totalRewards")}
                        </div>
                        <div className={styles.assetMetricValue}>
                          {selectedAsset.pendingUnstake
                            ? t("staking.availableAt", { date: formatDateTime(selectedAsset.pendingUnstake.availableAt) })
                            : `${formatAssetAmount(selectedAsset.assetId, selectedAsset.claimableReward)} ${selectedAsset.symbol}`}
                        </div>
                      </div>
                    </div>

                    <div className={styles.assetMetaRow}>
                      <span>{t("staking.modal.minStake", {
                        amount: formatAssetAmount(selectedAsset.assetId, selectedAsset.minStake),
                        asset: selectedAsset.symbol,
                      })}</span>
                      {selectedAsset.pendingUnstake ? (
                        <span>{t("staking.availableAt", { date: formatDateTime(selectedAsset.pendingUnstake.availableAt) })}</span>
                      ) : (
                        <span>{t("staking.totalStaked")}: {formatAssetLabel(selectedAsset)} {selectedAsset.symbol}</span>
                      )}
                    </div>

                    <div className={styles.assetActions}>
                      <button
                        type="button"
                        className={styles.assetActionButton}
                        disabled={!selectedAsset.canClaim || claimingAssetId === selectedAsset.assetId}
                        onClick={() => {
                          void handleClaim(selectedAsset)
                        }}
                      >
                        {claimingAssetId === selectedAsset.assetId ? t("common.processing") : t("staking.claim")}
                      </button>
                      <button
                        type="button"
                        className={styles.assetActionButton}
                        disabled={!selectedAsset.canStake || isActionSubmitting}
                        onClick={() => setActionState({ mode: "stake", asset: selectedAsset })}
                      >
                        {t("staking.stakeAction")}
                      </button>
                      <button
                        type="button"
                        className={cn(styles.assetActionButton, styles.assetActionButtonGhost)}
                        disabled={!selectedAsset.canUnstake || isActionSubmitting}
                        onClick={() => setActionState({ mode: "unstake", asset: selectedAsset })}
                      >
                        {t("staking.unstakeAction")}
                      </button>
                    </div>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
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
          label={t("staking.totalStaked")}
          value={<AssetInlineSummary assets={assets} field="stakedPrincipal" />}
          className={styles.summaryStatCard}
        />
        <StatCard
          icon={<Trophy className="h-5 w-5 text-foreground" />}
          iconClassName="bg-gradient-to-br from-brand-2 to-brand-1"
          label={t("staking.yourPlace", { metric: activeSortLabel })}
          value={yourRank ? t("staking.placeValue", { rank: yourRank }) : "--"}
        />
      </motion.div>

      <motion.div
        className="mb-[var(--section-gap)]"
        initial={sectionInitial}
        animate={sectionAnimate}
        transition={{ duration: shouldReduceMotion ? 0.1 : 0.2, ease: EASE, delay: shouldReduceMotion ? 0 : 0.06 }}
      >
        <div className={styles.leaderboardHeader}>
          <h2 className={styles.leaderboardTitle}>{t("staking.leaderboard")}</h2>
          <GlassSegmentedControl
            items={sortItems}
            value={sortBy}
            onChange={(next) => setSortBy(next)}
            ariaLabel={t("staking.sortLabel")}
            className={styles.sortSwitch}
            size="sm"
            layoutId="staking-sort-indicator"
            indicatorSheen="off"
            activeButtonChrome="off"
            indicatorTransition={shouldReduceMotion ? { duration: 0.12 } : STAKING_SORT_INDICATOR_MOTION}
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
                <span>{t("staking.rank")}</span>
                <span>{t("staking.player")}</span>
                <span className="text-right">{metricHeader(sortBy, t)}</span>
              </div>

              {isLeaderboardLoading ? (
                <div className={styles.leaderboardState}>{t("staking.loading")}</div>
              ) : null}

              {!isLeaderboardLoading && leaderboardError ? (
                <div className={styles.leaderboardState}>{t("staking.unavailable")}</div>
              ) : null}

              {!isLeaderboardLoading && !leaderboardError && leaderboard.length === 0 ? (
                <div className={styles.leaderboardState}>{t("staking.empty")}</div>
              ) : null}

              {!isLeaderboardLoading && !leaderboardError && leaderboard.length > 0 ? (
                <div className={styles.leaderboardList}>
                  {leaderboard.map((entry, index) => {
                    const isTop = index < 3
                    const isCurrent = entry.userId === currentUserId

                    return (
                      <div
                        key={`${entry.userId}-${entry.rank}`}
                        className={cn(
                          styles.leaderboardRow,
                          isTop && styles.leaderboardRowTop,
                          isTop && styles.leaderboardRowTop3,
                          isCurrent && styles.leaderboardRowCurrent,
                        )}
                      >
                        <div className={styles.rankCell}>
                          <span className={cn("text-sm font-bold", rankColor(entry.rank))}>#{entry.rank}</span>
                        </div>

                        <div className={styles.playerCell}>
                          <AvatarCell entry={entry} isTop={isTop} />
                          <div className={styles.playerName}>{entry.displayName}</div>
                        </div>

                        <div className={styles.metricCell}>{metricValue(entry, sortBy, intlLocale)}</div>
                      </div>
                    )
                  })}
                </div>
              ) : null}
            </GlassCard>
          </motion.div>
        </AnimatePresence>

        <div className={styles.leaderboardMeta}>{t("staking.playersCount", { count: totalPlayers })}</div>
      </motion.div>

      <StakingActionModal
        open={actionState !== null}
        mode={actionState?.mode ?? null}
        asset={actionState?.asset ?? null}
        isSubmitting={isActionSubmitting}
        onClose={() => {
          if (isActionSubmitting) return
          setActionState(null)
        }}
        onSubmit={handleActionSubmit}
      />

      {toast ? (
        <div
          className="glass-card fixed left-1/2 z-50 -translate-x-1/2 rounded-[var(--radius-md)] px-4 py-2.5 text-xs font-medium text-foreground shadow-[var(--shadow-md)]"
          style={{
            bottom: "calc(var(--bottom-nav-h) + var(--content-safe-bottom) + 12px)",
            animation: "fadeInUp 0.25s ease-out",
          }}
        >
          {toast}
        </div>
      ) : null}
    </div>
  )
}
