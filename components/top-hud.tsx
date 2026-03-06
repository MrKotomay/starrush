"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ChevronUp, Vault, Wallet } from "lucide-react"

import { useI18n } from "@/lib/i18n"
import rushStyles from "@/styles/starrush.module.css"

type HudTab = "staking" | "mine" | "profile"

type TopHudProps = {
  activeTab: HudTab
  tonBalance: number
  starsBalance?: number
  activeBalanceCurrency: "TON" | "STARS"
  onlineCount?: number
  avatarUrl?: string
  username?: string
  isRefreshingBalances?: boolean
  onRefreshBalances?: () => void
  onDepositClick?: () => void
  onWalletClick?: () => void
  onActiveBalanceCurrencyChange?: (currency: "TON" | "STARS") => void
  avatarLayoutId?: string
}

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]
const BALANCE_DROPDOWN_CLOSE_MS = 180

function formatStarsBalance(value: number): string {
  if (!Number.isFinite(value)) return "0"
  const safe = Math.max(0, value)
  const rounded = Math.round(safe * 100) / 100
  if (Number.isInteger(rounded)) return String(rounded)
  return rounded.toFixed(2).replace(/\.?0+$/, "")
}

export function TopHud({
  activeTab,
  tonBalance,
  starsBalance = 0,
  activeBalanceCurrency,
  onlineCount = 0,
  avatarUrl,
  username = "U",
  isRefreshingBalances = false,
  onRefreshBalances,
  onDepositClick,
  onWalletClick,
  onActiveBalanceCurrencyChange,
  avatarLayoutId = "shared-profile-avatar",
}: TopHudProps) {
  const { t } = useI18n()
  const [isBalanceSelectorOpen, setBalanceSelectorOpen] = useState(false)
  const currencySwitchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const shouldReduceMotion = useReducedMotion()
  const tonBalanceLabel = useMemo(() => tonBalance.toFixed(2), [tonBalance])
  const starsBalanceLabel = useMemo(() => formatStarsBalance(starsBalance), [starsBalance])
  const inactiveBalanceCurrency = activeBalanceCurrency === "TON" ? "STARS" : "TON"
  const activeBalanceLabel = activeBalanceCurrency === "TON" ? tonBalanceLabel : starsBalanceLabel
  const inactiveBalanceLabel = inactiveBalanceCurrency === "TON" ? tonBalanceLabel : starsBalanceLabel
  const isRushTab = activeTab === "mine"
  const isStakingTab = activeTab === "staking"

  useEffect(() => {
    setBalanceSelectorOpen(false)
  }, [activeTab])

  useEffect(() => {
    return () => {
      if (currencySwitchTimerRef.current) {
        clearTimeout(currencySwitchTimerRef.current)
      }
    }
  }, [])

  const switchBalanceCurrency = (nextCurrency: "TON" | "STARS") => {
    setBalanceSelectorOpen(false)
    if (!onActiveBalanceCurrencyChange || nextCurrency === activeBalanceCurrency) return

    if (currencySwitchTimerRef.current) {
      clearTimeout(currencySwitchTimerRef.current)
      currencySwitchTimerRef.current = null
    }

    if (shouldReduceMotion) {
      onActiveBalanceCurrencyChange(nextCurrency)
      return
    }

    currencySwitchTimerRef.current = setTimeout(() => {
      currencySwitchTimerRef.current = null
      onActiveBalanceCurrencyChange(nextCurrency)
    }, BALANCE_DROPDOWN_CLOSE_MS)
  }

  const hudTransition = shouldReduceMotion
    ? { duration: 0.1 }
    : { duration: 0.26, ease: EASE }
  const iconTransition = shouldReduceMotion ? { duration: 0.1 } : { duration: 0.16 }
  const avatarTransition = shouldReduceMotion
    ? ({ duration: 0.1 } as const)
    : ({ type: "spring", stiffness: 330, damping: 30, mass: 0.7 } as const)

  return (
    <div
      className="relative z-20 w-full px-[var(--page-px)] pt-[calc(var(--content-safe-top)+42px)] pb-2"
      data-ui="shared-top-hud"
    >
      <div className="flex items-center justify-between">
        <div className="flex w-[132px] items-center justify-start">
          <AnimatePresence mode="wait" initial={false}>
            {isRushTab ? (
              <motion.div
                key="hud-online"
                className={rushStyles.playersBadge}
                data-ui="shared-online-chip"
                initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: -16, scale: 0.98 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: -10, scale: 0.98 }}
                transition={hudTransition}
              >
                <span className={rushStyles.greenDot} />
                <span>{onlineCount}</span>
              </motion.div>
            ) : !isStakingTab ? (
              <motion.button
                key="hud-wallet"
                type="button"
                onClick={onWalletClick}
                className="glass-pill focus-brand inline-flex min-h-10 items-center gap-2 rounded-full px-3.5 py-2 text-[0.8rem] font-semibold tracking-[0.01em] text-foreground"
                initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: -12, scale: 0.98 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: -16, scale: 0.98 }}
                transition={hudTransition}
              >
                <Wallet className="h-4 w-4" />
                {t("topHud.wallet")}
              </motion.button>
            ) : (
              <motion.div
                key="hud-spacer"
                className="h-10 w-[116px]"
                aria-hidden="true"
                initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: -10, scale: 0.98 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: -12, scale: 0.98 }}
                transition={hudTransition}
              />
            )}
          </AnimatePresence>
        </div>

        {isStakingTab ? (
          <motion.div
            key="staking-chip"
            transition={avatarTransition}
            className="glass-pill inline-flex h-10 items-center gap-2 rounded-full px-4 text-[0.8rem] font-semibold tracking-[0.01em] text-foreground"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full border border-white/8 bg-gradient-to-br from-brand-1/22 to-brand-2/14 text-foreground/88">
              <Vault className="h-3.5 w-3.5" />
            </span>
            <span>{t("common.staking")}</span>
          </motion.div>
        ) : (
          <div className="h-[54px] w-[54px]" aria-hidden="true" />
        )}

        <div className="flex w-[152px] justify-end">
            <div className={rushStyles.balanceSelector}>
              <div className={rushStyles.balanceChip} data-ui="shared-balance-chip">
              <div className={rushStyles.balanceMain} aria-label={t("topHud.balanceAria", { currency: activeBalanceCurrency })}>
                <button
                  type="button"
                  data-ui="shared-balance-chevron"
                  className={`${rushStyles.balanceChevronBtn} ${isBalanceSelectorOpen ? rushStyles.balanceChevronBtnOpen : ""}`}
                  onClick={() => setBalanceSelectorOpen((prev) => !prev)}
                  aria-label={t("topHud.balanceSelector")}
                  aria-expanded={isBalanceSelectorOpen}
                >
                  <ChevronUp size={14} strokeWidth={2.4} />
                </button>
                <AnimatePresence mode="wait" initial={false}>
                  {activeBalanceCurrency === "TON" ? (
                    <motion.img
                      key="shared-balance-icon-ton"
                      src="/ton.svg"
                      alt="TON"
                      className={rushStyles.tonIcon}
                      initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 3 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -3 }}
                      transition={iconTransition}
                    />
                  ) : (
                    <motion.img
                      key="shared-balance-icon-stars"
                      src="/stars.svg"
                      alt="STARS"
                      className={rushStyles.starsIcon}
                      initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 3 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -3 }}
                      transition={iconTransition}
                    />
                  )}
                </AnimatePresence>

                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={`shared-balance-value-${activeBalanceCurrency}`}
                    className={rushStyles.balanceValue}
                    initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 3 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -3 }}
                    transition={iconTransition}
                  >
                    {activeBalanceLabel}
                  </motion.span>
                </AnimatePresence>
              </div>

              <button
                type="button"
                className={rushStyles.plusBtn}
                disabled={onDepositClick ? false : isRefreshingBalances}
                onClick={() => {
                  if (onDepositClick) {
                    onDepositClick()
                    return
                  }
                  onRefreshBalances?.()
                }}
                title={onDepositClick ? t("topHud.depositBalance") : isRefreshingBalances ? t("topHud.refreshing") : t("topHud.refreshBalance")}
              >
                +
              </button>
            </div>

            <div
              className={`${rushStyles.balanceDropdown} ${isBalanceSelectorOpen ? rushStyles.balanceDropdownOpen : ""}`}
              aria-hidden={!isBalanceSelectorOpen}
            >
              <button
                type="button"
                className={rushStyles.balanceOption}
                onClick={() => {
                  switchBalanceCurrency(inactiveBalanceCurrency)
                }}
              >
                {inactiveBalanceCurrency === "TON" ? (
                  <img src="/ton.svg" alt="TON" className={rushStyles.tonIcon} />
                ) : (
                  <img src="/stars.svg" alt="STARS" className={rushStyles.starsIcon} />
                )}
                <span className={rushStyles.balanceValue}>{inactiveBalanceLabel}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

