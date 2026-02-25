"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ChevronUp, Wallet } from "lucide-react"

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
  const [isBalanceSelectorOpen, setBalanceSelectorOpen] = useState(false)
  const currencySwitchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const shouldReduceMotion = useReducedMotion()
  const tonBalanceLabel = useMemo(() => tonBalance.toFixed(2), [tonBalance])
  const starsBalanceLabel = useMemo(() => formatStarsBalance(starsBalance), [starsBalance])
  const inactiveBalanceCurrency = activeBalanceCurrency === "TON" ? "STARS" : "TON"
  const activeBalanceLabel = activeBalanceCurrency === "TON" ? tonBalanceLabel : starsBalanceLabel
  const inactiveBalanceLabel = inactiveBalanceCurrency === "TON" ? tonBalanceLabel : starsBalanceLabel
  const isRushTab = activeTab === "mine"
  const showCenterAvatar = activeTab === "staking"

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
      className="relative z-20 w-full px-[var(--page-px)] pt-[calc(var(--content-safe-top)+48px)] pb-2"
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
            ) : (
              <motion.button
                key="hud-wallet"
                type="button"
                onClick={onWalletClick}
                className="btn-primary-glow focus-brand inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold tracking-wide"
                initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: -12, scale: 0.98 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: -16, scale: 0.98 }}
                transition={hudTransition}
              >
                <Wallet className="h-4 w-4" />
                Кошелек
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {showCenterAvatar ? (
          <motion.div
            layoutId={avatarLayoutId}
            transition={avatarTransition}
            className="h-14 w-14 rounded-full p-[2px]"
            style={{
              backgroundImage: "var(--primary-gradient)",
              boxShadow: "var(--glow-primary), var(--shadow-sm)",
            }}
          >
            <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-surface-1">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Telegram avatar" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand-1/36 to-brand-2/24">
                  <span className="text-base font-bold text-foreground">
                    {username.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        ) : (
          <div className="h-14 w-14" aria-hidden="true" />
        )}

        <div className="flex w-[148px] justify-end">
          <div className={rushStyles.balanceSelector}>
            <div className={rushStyles.balanceChip} data-ui="shared-balance-chip">
              <div className={rushStyles.balanceMain} aria-label={`${activeBalanceCurrency} баланс`}>
                <button
                  type="button"
                  data-ui="shared-balance-chevron"
                  className={`${rushStyles.balanceChevronBtn} ${isBalanceSelectorOpen ? rushStyles.balanceChevronBtnOpen : ""}`}
                  onClick={() => setBalanceSelectorOpen((prev) => !prev)}
                  aria-label="Переключить селектор баланса"
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
                title={onDepositClick ? "Пополнить баланс" : isRefreshingBalances ? "Обновление..." : "Обновить баланс"}
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

