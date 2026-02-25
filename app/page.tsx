"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { AnimatePresence, LayoutGroup, MotionConfig, motion, useReducedMotion } from "framer-motion"
import { useTelegramUser } from "@/lib/use-telegram-user"
import { runMiniAppBootstrap } from "@/lib/mini-app-bootstrap"
import { ProfileHeader } from "@/components/profile-header"
import { StatCards } from "@/components/stat-cards"
import { ActionButtons } from "@/components/action-buttons"
import { Achievements } from "@/components/achievements"
import { ReferralProgram } from "@/components/referral-program"
import { SettingsMenu } from "@/components/settings-menu"
import { BottomNavigation } from "@/components/bottom-navigation"
import { ParticleBackground } from "@/components/particle-background"
import { StakingContent } from "@/components/staking-content"
import { TopHud } from "@/components/top-hud"
import { WalletActionModal } from "@/components/wallet-action-modal"
import { WalletOverviewModal } from "@/components/wallet-overview-modal"
import { AppBootstrapSplash } from "@/components/app-bootstrap-splash"
import { DepositFundsModal } from "@/components/deposit-funds-modal"

const CrashGame = dynamic(
  () => import("@/components/crash/CrashGame").then((mod) => mod.CrashGame),
  {
    ssr: false,
    loading: () => (
      <div className="h-[320px] w-full rounded-3xl border border-border/60 bg-card/80 flex items-center justify-center sm:h-[380px] lg:h-[460px]">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-muted-foreground/70">Загрузка игры...</p>
        </div>
      </div>
    ),
  }
)

const mockAchievements = [
  { id: 1, color: "from-primary to-primarySoft", unlocked: true },
  { id: 2, color: "from-primarySoft to-primary", unlocked: true },
  { id: 3, color: "from-primary/85 to-primarySoft/75", unlocked: true },
  { id: 4, color: "from-primarySoft/85 to-primary/72", unlocked: true },
]

type WalletCurrency = "TON" | "STARS"
type TabId = "staking" | "mine" | "profile"
type WalletActionMode = "withdraw" | null

type WalletView = {
  id: string
  currency: WalletCurrency
  balance: string
  lockedBalance: string
}

type LedgerView = {
  id: string
  currency: WalletCurrency
  amount: string
  type: string
  status: string
  createdAt: string
}

type WalletsApiResponse = {
  ok?: boolean
  error?: string
  wallets?: WalletView[]
}

type LedgerApiResponse = {
  ok?: boolean
  error?: string
  ledger?: Array<{
    id: string
    currency: WalletCurrency
    amount: string
    type: string
    status: string
    createdAt: string
  }>
}

type WalletActionApiResponse = {
  ok?: boolean
  error?: string
  ledger?: {
    id: string
    type: string
    status: string
    amount: string
    currency: WalletCurrency
    referenceId: string
  }
  wallet?: WalletView | null
}

type ReferralSummaryView = {
  invitedCount: number
  earnedTon: string
  earnedStars: string
  commissionRate: string
  referralLink: string
}

type ReferralSummaryApiResponse = {
  ok?: boolean
  error?: string
  summary?: ReferralSummaryView
}

function toNumber(value: string | number | null | undefined, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function mapWalletActionError(code: string | undefined) {
  switch (code) {
    case "UNAUTHORIZED":
      return "Нужна авторизация"
    case "RATE_LIMIT":
      return "Слишком часто, попробуйте чуть позже"
    case "INVALID_INPUT":
    case "INVALID_AMOUNT":
      return "Некорректная сумма"
    case "INSUFFICIENT_BALANCE":
      return "Недостаточно доступного баланса"
    case "DEV_WALLET_ACTIONS_DISABLED":
      return "Dev wallet actions выключен. Включите ENABLE_DEV_WALLET_ACTIONS=1"
    case "DEPOSIT_FAILED":
      return "Не удалось выполнить пополнение"
    case "WITHDRAW_FAILED":
      return "Не удалось выполнить вывод"
    default:
      return "Операция не выполнена"
  }
}

export default function ProfilePage() {
  const [activeTab, setActiveTab] = useState<TabId>("mine")
  const [selectedBalanceCurrency, setSelectedBalanceCurrency] = useState<"TON" | "STARS">("TON")
  const { state: telegram } = useTelegramUser()
  const initialWalletsFromAuth = telegram.status === "ready" ? telegram.wallets : undefined
  const [walletsState, setWalletsState] = useState<WalletView[]>([])
  const [ledgerState, setLedgerState] = useState<LedgerView[]>([])
  const [walletActionMode, setWalletActionMode] = useState<WalletActionMode>(null)
  const [isDepositModalOpen, setDepositModalOpen] = useState(false)
  const [isWalletActionSubmitting, setWalletActionSubmitting] = useState(false)
  const [isWalletOverviewOpen, setWalletOverviewOpen] = useState(false)
  const [isWalletsLoading, setWalletsLoading] = useState(false)
  const [isLedgerLoading, setLedgerLoading] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [rushOnlineCount, setRushOnlineCount] = useState(0)
  const [referralSummary, setReferralSummary] = useState<ReferralSummaryView | null>(null)
  const [isAppBootReady, setAppBootReady] = useState(false)
  const [bootProgress, setBootProgress] = useState(0.06)
  const [bootLabel, setBootLabel] = useState("Проверяем авторизацию Telegram")
  const bootStartedRef = useRef(false)
  const telegramReadySentRef = useRef(false)

  useEffect(() => {
    if (!Array.isArray(initialWalletsFromAuth)) return
    setWalletsState(initialWalletsFromAuth)
  }, [initialWalletsFromAuth])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 2200)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    let cancelled = false

    if (telegram.status === "error") {
      setBootProgress(1)
      setBootLabel("Не удалось авторизоваться")
      setAppBootReady(true)
      return
    }

    if (telegram.status !== "ready") {
      setBootProgress((prev) => Math.max(prev, 0.08))
      setBootLabel("Проверяем авторизацию Telegram")
      return
    }

    if (bootStartedRef.current) return
    bootStartedRef.current = true
    const splashStartedAt = Date.now()

    void runMiniAppBootstrap({
      onProgress: ({ value, label }) => {
        if (cancelled) return
        setBootProgress((prev) => Math.max(prev, value))
        setBootLabel(label)
      },
    })
      .then(async (result) => {
        if (cancelled) return

        if (Array.isArray(result.warmData.wallets) && result.warmData.wallets.length > 0) {
          setWalletsState(result.warmData.wallets)
        }
        if (result.warmData.referralSummary) {
          setReferralSummary(result.warmData.referralSummary)
        }

        const minSplashMs = 520
        const elapsedMs = Date.now() - splashStartedAt
        if (elapsedMs < minSplashMs) {
          await new Promise((resolve) => window.setTimeout(resolve, minSplashMs - elapsedMs))
        }
        if (cancelled) return

        setBootProgress(1)
        setBootLabel("Запуск приложения")
        setAppBootReady(true)
      })
      .catch(() => {
        if (cancelled) return
        setBootProgress(1)
        setBootLabel("Запуск без предзагрузки")
        setAppBootReady(true)
      })

    return () => {
      cancelled = true
    }
  }, [telegram.status])

  useEffect(() => {
    if (telegramReadySentRef.current) return
    if (telegram.status !== "error" && !isAppBootReady) return
    if (typeof window === "undefined") return

    const tg = (window as unknown as {
      Telegram?: {
        WebApp?: {
          ready?: () => void
          expand?: () => void
        }
      }
    }).Telegram?.WebApp

    if (!tg) return

    try {
      tg.ready?.()
      tg.expand?.()
    } finally {
      telegramReadySentRef.current = true
    }
  }, [isAppBootReady, telegram.status])

  const refreshWallets = useCallback(async () => {
    setWalletsLoading(true)
    try {
      const response = await fetch("/api/wallets", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json" },
      })
      const payload = (await response.json().catch(() => ({}))) as WalletsApiResponse
      if (!response.ok || payload.ok !== true || !Array.isArray(payload.wallets)) return
      setWalletsState(payload.wallets)
    } finally {
      setWalletsLoading(false)
    }
  }, [])

  const refreshLedger = useCallback(async () => {
    setLedgerLoading(true)
    try {
      const response = await fetch("/api/ledger/history?limit=20", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json" },
      })
      const payload = (await response.json().catch(() => ({}))) as LedgerApiResponse
      if (!response.ok || payload.ok !== true || !Array.isArray(payload.ledger)) return
      setLedgerState(payload.ledger)
    } finally {
      setLedgerLoading(false)
    }
  }, [])

  const refreshReferralSummary = useCallback(async () => {
    try {
      const response = await fetch("/api/referrals/summary", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json" },
      })
      const payload = (await response.json().catch(() => ({}))) as ReferralSummaryApiResponse
      if (!response.ok || payload.ok !== true || !payload.summary) return
      setReferralSummary(payload.summary)
    } catch {
      // ignore summary refresh errors to keep profile usable
    }
  }, [])

  const openWalletOverview = useCallback(() => {
    setWalletOverviewOpen(true)
    void refreshWallets()
    void refreshLedger()
  }, [refreshLedger, refreshWallets])

  const handleWalletsRefresh = useCallback(() => {
    void refreshWallets()
  }, [refreshWallets])

  useEffect(() => {
    if (telegram.status !== "ready" || !isAppBootReady) return
    void refreshReferralSummary()
  }, [isAppBootReady, refreshReferralSummary, telegram.status])

  const handleWalletActionSubmit = useCallback(
    async (input: { amount: number; currency: WalletCurrency }) => {
      const mode = walletActionMode
      if (!mode) return

      setWalletActionSubmitting(true)
      try {
        const response = await fetch(`/api/wallets/${mode}`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            amount: Number(input.amount.toFixed(6)),
            currency: input.currency,
          }),
        })

        const payload = (await response.json().catch(() => ({}))) as WalletActionApiResponse
        if (!response.ok || payload.ok !== true) {
          setToast(mapWalletActionError(payload.error))
          return
        }

        await refreshWallets()
        await refreshLedger()
        setWalletActionMode(null)
        setToast(`Вывод ${input.amount.toFixed(2)} ${input.currency} выполнен`)
      } finally {
        setWalletActionSubmitting(false)
      }
    },
    [refreshLedger, refreshWallets, walletActionMode]
  )
  const shouldReduceMotion = useReducedMotion()
  const hasHeavyOverlay = isDepositModalOpen || isWalletOverviewOpen || walletActionMode !== null
  const isMineSceneActive = activeTab === "mine" && !hasHeavyOverlay
  const tabEnter = { opacity: 0 }
  const tabActive = { opacity: 1 }
  const tabExit = { opacity: 0 }
  const tabTransition = shouldReduceMotion
    ? { duration: 0.1 }
    : { duration: 0.2, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }

  useEffect(() => {
    if (typeof document === "undefined") return
    if (hasHeavyOverlay) {
      document.body.dataset.adaptiveMotion = "reduced"
    } else {
      delete document.body.dataset.adaptiveMotion
    }

    return () => {
      delete document.body.dataset.adaptiveMotion
    }
  }, [hasHeavyOverlay])

  if (telegram.status === "error") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="max-w-md w-full rounded-2xl border border-border bg-card/70 backdrop-blur-sm p-6 text-center">
          <h1 className="text-xl font-bold text-foreground mb-2">Ошибка авторизации Telegram</h1>
          <p className="text-muted-foreground text-sm mb-4">
            Код: <span className="text-foreground font-semibold">{telegram.error}</span>
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:brightness-105"
          >
            Перезагрузить
          </button>
        </div>
      </div>
    )
  }

  if (!isAppBootReady) {
    return <AppBootstrapSplash progress={bootProgress} label={bootLabel} />
  }

  const tgUser = telegram.status === "ready" ? telegram.user : undefined
  const username = tgUser?.username || tgUser?.first_name || "guest"
  const avatarUrl = tgUser?.photo_url
  const bio = tgUser
    ? `${tgUser.first_name || ""}${tgUser.last_name ? ` ${tgUser.last_name}` : ""}`.trim() || "Telegram user"
    : "Crypto enthusiast • DeFi explorer"

  const tonWallet = walletsState.find((wallet) => wallet.currency === "TON")
  const tonBalance = toNumber(tonWallet?.balance)
  const starsWallet = walletsState.find((wallet) => wallet.currency === "STARS")
  const starsBalance = toNumber(starsWallet?.balance)

  const handleTabChange = (nextTab: TabId) => {
    setActiveTab(nextTab)
  }
  const sharedAvatarLayoutId = "shared-profile-avatar"
  const topHudProps = {
    activeTab,
    tonBalance,
    starsBalance,
    activeBalanceCurrency: selectedBalanceCurrency,
    onlineCount: rushOnlineCount,
    avatarUrl,
    username,
    isRefreshingBalances: isWalletsLoading,
    onRefreshBalances: handleWalletsRefresh,
    onDepositClick: () => setDepositModalOpen(true),
    onWalletClick: openWalletOverview,
    onActiveBalanceCurrencyChange: setSelectedBalanceCurrency,
    avatarLayoutId: sharedAvatarLayoutId,
  } as const

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background bg-cosmic-radial">
      <ParticleBackground active={!hasHeavyOverlay} />

      {activeTab === "mine" ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-30 mx-auto w-full max-w-md">
          <div className="pointer-events-auto">
            <TopHud {...topHudProps} />
          </div>
        </div>
      ) : null}

      <MotionConfig reducedMotion="user">
        <LayoutGroup id="profile-avatar-layout">
          <main className="safe-bottom-pad relative z-10 mx-auto max-w-md">
            {activeTab === "staking" ? (
              <TopHud {...topHudProps} />
            ) : null}

            <AnimatePresence mode="wait" initial={false}>
              {activeTab === "staking" ? (
                <motion.section
                  key="tab-staking"
                  initial={tabEnter}
                  animate={tabActive}
                  exit={tabExit}
                  transition={tabTransition}
                >
                  <StakingContent />
                </motion.section>
              ) : null}

              {activeTab === "mine" ? (
                <motion.section
                  key="tab-mine"
                  initial={tabEnter}
                  animate={tabActive}
                  exit={tabExit}
                  transition={tabTransition}
                >
                  <div className="w-full">
                    <CrashGame
                      demoMode={true}
                      tonBalance={tonBalance}
                      starsBalance={starsBalance}
                      isActive={isMineSceneActive}
                      onOnlineCountChange={setRushOnlineCount}
                      onWalletNeedsRefresh={handleWalletsRefresh}
                    />
                  </div>
                </motion.section>
              ) : null}

              {activeTab === "profile" ? (
                <motion.section
                  key="tab-profile"
                  className="pt-[calc(var(--content-safe-top)+48px)]"
                  initial={tabEnter}
                  animate={tabActive}
                  exit={tabExit}
                  transition={tabTransition}
                >
                  <ProfileHeader
                    username={username}
                    bio={bio}
                    avatarUrl={avatarUrl}
                    avatarLayoutId={sharedAvatarLayoutId}
                  />

                  <StatCards
                    starsBalance={starsBalance}
                    tonBalance={tonBalance}
                    referrals={referralSummary?.invitedCount ?? 0}
                    rewards={8}
                  />

                  <ActionButtons
                    onDeposit={() => setDepositModalOpen(true)}
                    onWithdraw={() => setWalletActionMode("withdraw")}
                    isDepositLoading={false}
                    isWithdrawLoading={isWalletActionSubmitting && walletActionMode === "withdraw"}
                  />

                  <Achievements
                    achievements={mockAchievements}
                    onViewAll={() => setToast("Экран достижений пока в работе")}
                  />

                  <div className="mt-[var(--section-gap)] px-[var(--page-px)]">
                    <ReferralProgram
                      invitedCount={referralSummary?.invitedCount ?? 0}
                      earnedTon={referralSummary?.earnedTon ?? "0"}
                      earnedStars={referralSummary?.earnedStars ?? "0"}
                      referralLink={referralSummary?.referralLink ?? "https://t.me/starrush_bot"}
                      commissionRate={referralSummary?.commissionRate ?? "0.10"}
                    />
                  </div>

                  <div className="mt-[var(--section-gap)] px-[var(--page-px)]">
                    <SettingsMenu
                      onWalletClick={openWalletOverview}
                      onStakingClick={() => handleTabChange("staking")}
                      onSettingsClick={() => setToast("Настройки будут подключены следующим шагом")}
                    />
                  </div>
                </motion.section>
              ) : null}
            </AnimatePresence>
          </main>
        </LayoutGroup>
      </MotionConfig>

      <BottomNavigation activeTab={activeTab} onTabChange={handleTabChange} />

      <WalletActionModal
        open={walletActionMode !== null}
        mode={walletActionMode}
        isSubmitting={isWalletActionSubmitting}
        onClose={() => {
          if (isWalletActionSubmitting) return
          setWalletActionMode(null)
        }}
        onSubmit={handleWalletActionSubmit}
      />

      <WalletOverviewModal
        open={isWalletOverviewOpen}
        wallets={walletsState}
        ledger={ledgerState}
        isWalletsLoading={isWalletsLoading}
        isLedgerLoading={isLedgerLoading}
        onRefreshWallets={() => {
          void refreshWallets()
        }}
        onRefreshLedger={() => {
          void refreshLedger()
        }}
        onClose={() => setWalletOverviewOpen(false)}
      />

      <DepositFundsModal
        open={isDepositModalOpen}
        onClose={() => setDepositModalOpen(false)}
        onCompleted={() => {
          void refreshWallets()
          void refreshLedger()
        }}
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
