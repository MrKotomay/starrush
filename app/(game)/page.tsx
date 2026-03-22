"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { useTonConnectUI } from "@tonconnect/ui-react"
import { useTonWallet } from "@tonconnect/ui-react"
import { AnimatePresence, LayoutGroup, MotionConfig, motion, useReducedMotion } from "framer-motion"

import { AppBootstrapSplash } from "@/components/app-bootstrap-splash"
import { Achievements } from "@/components/achievements"
import { ActionButtons } from "@/components/action-buttons"
import { BottomNavigation } from "@/components/bottom-navigation"
import { DepositFundsModal } from "@/components/deposit-funds-modal"
import { ParticleBackground } from "@/components/particle-background"
import { ProfileHeader } from "@/components/profile-header"
import { ReferralProgram } from "@/components/referral-program"
import { SettingsMenu } from "@/components/settings-menu"
import { StakingContent } from "@/components/staking-content"
import { StatCards } from "@/components/stat-cards"
import { TopHud } from "@/components/top-hud"
import { WalletActionModal } from "@/components/wallet-action-modal"
import { WalletOverviewModal } from "@/components/wallet-overview-modal"
import { AppSettingsProvider } from "@/lib/app-settings"
import { formatCurrencyAmount } from "@/lib/currency"
import { useI18n } from "@/lib/i18n"
import { runMiniAppBootstrap } from "@/lib/mini-app-bootstrap"
import { useUiSandboxSnapshot, withdrawUiSandboxWallet } from "@/lib/ui-sandbox"
import { useAdaptiveOverlayMotion } from "@/lib/use-adaptive-overlay-motion"
import { useTelegramUser } from "@/lib/use-telegram-user"

type WalletCurrency = "TON" | "STARS"
type TabId = "staking" | "mine" | "profile"
type WalletActionMode = "withdraw" | null
type TelegramState = ReturnType<typeof useTelegramUser>["state"]

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

const mockAchievements = [
  { id: 1, color: "from-primary to-primarySoft", unlocked: true },
  { id: 2, color: "from-primarySoft to-primary", unlocked: true },
  { id: 3, color: "from-primary/85 to-primarySoft/75", unlocked: true },
  { id: 4, color: "from-primarySoft/85 to-primary/72", unlocked: true },
]

function toNumber(value: string | number | null | undefined, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function mapWalletActionError(
  code: string | undefined,
  t: (key: string, vars?: Record<string, string | number>) => string,
) {
  switch (code) {
    case "UNAUTHORIZED":
      return t("walletAction.errorUnauthorized")
    case "RATE_LIMIT":
      return t("walletAction.errorRateLimit")
    case "INVALID_INPUT":
    case "INVALID_AMOUNT":
      return t("walletAction.errorInvalid")
    case "INSUFFICIENT_BALANCE":
      return t("walletAction.errorInsufficient")
    case "DEV_WALLET_ACTIONS_DISABLED":
      return t("walletAction.errorDevDisabled")
    case "DEPOSIT_FAILED":
      return t("walletAction.errorDepositFailed")
    case "WITHDRAW_FAILED":
      return t("walletAction.errorWithdrawFailed")
    default:
      return t("walletAction.errorGeneric")
  }
}

function CrashGameLoadingFallback() {
  const { t } = useI18n()

  return (
    <div className="flex h-[320px] w-full items-center justify-center rounded-3xl border border-border/60 bg-card/80 sm:h-[380px] lg:h-[460px]">
      <div className="text-center">
        <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground/70">{t("game.loading")}</p>
      </div>
    </div>
  )
}

const CrashGame = dynamic(
  () => import("@/components/crash/CrashGame").then((mod) => mod.CrashGame),
  {
    ssr: false,
    loading: () => <CrashGameLoadingFallback />,
  },
)

function ProfilePageContent({ telegram }: { telegram: TelegramState }) {
  const { t } = useI18n()
  const [tonConnectUI] = useTonConnectUI()
  const tonConnectWallet = useTonWallet()
  const uiSandboxSnapshot = useUiSandboxSnapshot()
  const shouldReduceMotion = useReducedMotion()
  const adaptiveOverlayMotion = useAdaptiveOverlayMotion()
  const isUiSandboxMode = telegram.status === "ready" && telegram.isUiSandboxMode === true
  const [activeTab, setActiveTab] = useState<TabId>("mine")
  const [selectedBalanceCurrency, setSelectedBalanceCurrency] = useState<"TON" | "STARS">("TON")
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
  const [bootLabel, setBootLabel] = useState("page.checkingTelegram")
  const bootStartedRef = useRef(false)
  const telegramReadySentRef = useRef(false)

  useEffect(() => {
    if (!Array.isArray(initialWalletsFromAuth)) return
    setWalletsState(initialWalletsFromAuth)
  }, [initialWalletsFromAuth])

  useEffect(() => {
    if (!isUiSandboxMode) return
    setWalletsState(uiSandboxSnapshot.wallets)
    setLedgerState(uiSandboxSnapshot.ledger)
    setReferralSummary(uiSandboxSnapshot.referralSummary)
  }, [isUiSandboxMode, uiSandboxSnapshot])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 2200)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    let cancelled = false

    if (telegram.status === "error") {
      setBootProgress(1)
      setBootLabel("page.authFailed")
      setAppBootReady(true)
      return
    }

    if (telegram.status !== "ready") {
      setBootProgress((prev) => Math.max(prev, 0.08))
      setBootLabel("page.checkingTelegram")
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
        setBootLabel("page.launchingApp")
        setAppBootReady(true)
      })
      .catch(() => {
        if (cancelled) return
        setBootProgress(1)
        setBootLabel("page.launchNoPreload")
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
    if (isUiSandboxMode) {
      setWalletsLoading(true)
      setWalletsState(uiSandboxSnapshot.wallets)
      setWalletsLoading(false)
      return
    }

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
  }, [isUiSandboxMode, uiSandboxSnapshot.wallets])

  const refreshLedger = useCallback(async () => {
    if (isUiSandboxMode) {
      setLedgerLoading(true)
      setLedgerState(uiSandboxSnapshot.ledger)
      setLedgerLoading(false)
      return
    }

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
  }, [isUiSandboxMode, uiSandboxSnapshot.ledger])

  const refreshReferralSummary = useCallback(async () => {
    if (isUiSandboxMode) {
      setReferralSummary(uiSandboxSnapshot.referralSummary)
      return
    }

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
      // keep profile usable if referrals refresh fails
    }
  }, [isUiSandboxMode, uiSandboxSnapshot.referralSummary])

  const openWalletOverview = useCallback(() => {
    setWalletOverviewOpen(true)
    void refreshWallets()
    void refreshLedger()
  }, [refreshLedger, refreshWallets])

  const openTonConnectMenu = useCallback(async () => {
    if (isUiSandboxMode) {
      openWalletOverview()
      return
    }

    try {
      await tonConnectUI.openModal()
    } catch {
      setToast(t("deposit.error.openTonConnect"))
    }
  }, [isUiSandboxMode, openWalletOverview, t, tonConnectUI])

  const handleStakingWalletClick = useCallback(() => {
    void openTonConnectMenu()
  }, [openTonConnectMenu])

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
        if (isUiSandboxMode) {
          const result = withdrawUiSandboxWallet({
            amount: Number(input.amount.toFixed(6)),
            currency: input.currency,
          })

          if (!result.ok) {
            setToast(mapWalletActionError(result.error, t))
            return
          }

          await refreshWallets()
          await refreshLedger()
          setWalletActionMode(null)
          setToast(
            t("walletAction.successWithdraw", {
              amount: formatCurrencyAmount(input.currency, input.amount, { compactStars: false }),
              currency: input.currency,
            }),
          )
          return
        }

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
          setToast(mapWalletActionError(payload.error, t))
          return
        }

        await refreshWallets()
        await refreshLedger()
        setWalletActionMode(null)
        setToast(
          t("walletAction.successWithdraw", {
            amount: formatCurrencyAmount(input.currency, input.amount, { compactStars: false }),
            currency: input.currency,
          }),
        )
      } finally {
        setWalletActionSubmitting(false)
      }
    },
    [isUiSandboxMode, refreshLedger, refreshWallets, t, walletActionMode],
  )

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

    if (hasHeavyOverlay && adaptiveOverlayMotion) {
      document.body.dataset.adaptiveMotion = "reduced"
    } else {
      delete document.body.dataset.adaptiveMotion
    }

    return () => {
      delete document.body.dataset.adaptiveMotion
    }
  }, [adaptiveOverlayMotion, hasHeavyOverlay])

  if (telegram.status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card/70 p-6 text-center backdrop-blur-sm">
          <h1 className="mb-2 text-xl font-bold text-foreground">{t("auth.errorTitle")}</h1>
          <p className="mb-4 text-sm text-muted-foreground">
            {t("auth.code", { code: telegram.error })}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full rounded-xl bg-primary py-3 font-semibold text-primary-foreground hover:brightness-105"
          >
            {t("auth.reload")}
          </button>
        </div>
      </div>
    )
  }

  if (!isAppBootReady) {
    return <AppBootstrapSplash progress={bootProgress} label={bootLabel} />
  }

  const tgUser = telegram.status === "ready" ? telegram.user : undefined
  const username = tgUser?.username || tgUser?.first_name || t("profile.guest")
  const avatarUrl = tgUser?.photo_url
  const bio = tgUser
    ? `${tgUser.first_name || ""}${tgUser.last_name ? ` ${tgUser.last_name}` : ""}`.trim() || t("profile.telegramUser")
    : t("profile.bioDefault")

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
    onWalletClick: activeTab === "staking" ? handleStakingWalletClick : openWalletOverview,
    onActiveBalanceCurrencyChange: setSelectedBalanceCurrency,
    avatarLayoutId: sharedAvatarLayoutId,
    showStakingChip: false,
  } as const

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background bg-cosmic-radial">
      <ParticleBackground active={!hasHeavyOverlay} />

      {activeTab === "mine" || activeTab === "staking" ? (
        <div className="absolute inset-x-0 top-0 z-40 mx-auto w-full max-w-md">
          <TopHud {...topHudProps} />
        </div>
      ) : null}

      <MotionConfig reducedMotion="user">
        <LayoutGroup id="profile-avatar-layout">
          <main className="safe-bottom-pad relative z-10 mx-auto max-w-md">
            <AnimatePresence mode="wait" initial={false}>
              {activeTab === "staking" ? (
                <motion.section
                  key="tab-staking"
                  className="pt-[calc(var(--content-safe-top)+112px)]"
                  initial={tabEnter}
                  animate={tabActive}
                  exit={tabExit}
                  transition={tabTransition}
                >
                  <StakingContent uiSandboxMode={isUiSandboxMode} />
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
                      demoMode={isUiSandboxMode}
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
                    onViewAll={() => setToast(t("toast.achievementsSoon"))}
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
                      onSettingsClick={() => setToast(t("toast.profileSettingsSoon"))}
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
        uiSandboxMode={isUiSandboxMode}
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
        tonWalletAddress={tonConnectWallet?.account?.address ?? null}
        tonWalletConnected={Boolean(tonConnectWallet?.account?.address)}
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
        uiSandboxMode={isUiSandboxMode}
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

export default function ProfilePage() {
  const { state: telegram } = useTelegramUser()
  const telegramLanguageCode = telegram.status === "ready" ? telegram.user?.language_code : undefined

  return (
    <AppSettingsProvider telegramLanguageCode={telegramLanguageCode}>
      <ProfilePageContent telegram={telegram} />
    </AppSettingsProvider>
  )
}
