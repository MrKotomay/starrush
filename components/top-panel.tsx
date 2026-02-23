"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ChevronUp, Wallet } from "lucide-react"
import rushStyles from "@/styles/starrush.module.css"

const BALANCE_SWITCH_DELAY_MS = 140

type TopPanelProps = {
  tonBalance: number
  starsBalance?: number
  avatarUrl?: string
  username?: string
  isRefreshingBalances?: boolean
  onRefreshBalances?: () => void
  onWalletClick?: () => void
  showCenterAvatar?: boolean
  avatarLayoutId?: string
}

function formatStarsBalance(value: number): string {
  if (!Number.isFinite(value)) return "0"
  const safe = Math.max(0, value)
  const rounded = Math.round(safe * 100) / 100
  if (Number.isInteger(rounded)) return String(rounded)
  return rounded.toFixed(2).replace(/\.?0+$/, "")
}

export function TopPanel({
  tonBalance,
  starsBalance = 0,
  avatarUrl,
  username = "U",
  isRefreshingBalances = false,
  onRefreshBalances,
  onWalletClick,
  showCenterAvatar = true,
  avatarLayoutId = "shared-profile-avatar",
}: TopPanelProps) {
  const [activeBalanceCurrency, setActiveBalanceCurrency] = useState<"TON" | "STARS">("TON")
  const [isBalanceSelectorOpen, setBalanceSelectorOpen] = useState(false)
  const balanceSwitchTimeoutRef = useRef<number | null>(null)
  const tonBalanceLabel = useMemo(() => tonBalance.toFixed(2), [tonBalance])
  const starsBalanceLabel = useMemo(() => formatStarsBalance(starsBalance), [starsBalance])
  const inactiveBalanceCurrency = activeBalanceCurrency === "TON" ? "STARS" : "TON"
  const activeBalanceLabel = activeBalanceCurrency === "TON" ? tonBalanceLabel : starsBalanceLabel
  const inactiveBalanceLabel = inactiveBalanceCurrency === "TON" ? tonBalanceLabel : starsBalanceLabel

  useEffect(() => {
    return () => {
      if (balanceSwitchTimeoutRef.current !== null) {
        window.clearTimeout(balanceSwitchTimeoutRef.current)
      }
    }
  }, [])

  const switchBalanceCurrency = (nextCurrency: "TON" | "STARS") => {
    if (balanceSwitchTimeoutRef.current !== null) {
      window.clearTimeout(balanceSwitchTimeoutRef.current)
      balanceSwitchTimeoutRef.current = null
    }
    setBalanceSelectorOpen(false)
    balanceSwitchTimeoutRef.current = window.setTimeout(() => {
      setActiveBalanceCurrency(nextCurrency)
      balanceSwitchTimeoutRef.current = null
    }, BALANCE_SWITCH_DELAY_MS)
  }

  return (
    <div className="flex items-center justify-between mb-6">
      <button
        type="button"
        onClick={onWalletClick}
        className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold tracking-wide focus-brand"
        style={{
          backgroundImage: "linear-gradient(135deg, #651DCB 0%, #7A5CFF 45%, #D761F1 100%)",
          color: "#F6F2FF",
          boxShadow: "0 0 18px rgba(101,29,203,0.40), 0 4px 12px rgba(4,7,22,0.30)",
          border: "1px solid rgba(122,92,255,0.25)",
        }}
      >
        <Wallet className="w-4 h-4" />
        Кошелек
      </button>

      {showCenterAvatar ? (
        <motion.div
          layoutId={avatarLayoutId}
          transition={{ type: "spring", stiffness: 330, damping: 30, mass: 0.7 }}
          className="w-14 h-14 rounded-full p-[2px]"
          style={{
            backgroundImage: "linear-gradient(135deg, #651DCB 0%, #7A5CFF 50%, #D761F1 100%)",
            boxShadow: "0 0 16px rgba(101,29,203,0.35), 0 4px 10px rgba(4,7,22,0.25)",
          }}
        >
          <div className="w-full h-full rounded-full overflow-hidden flex items-center justify-center" style={{ background: "#141A3A" }}>
            {avatarUrl ? (
              <img src={avatarUrl} alt="Telegram avatar" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, rgba(101,29,203,0.30) 0%, rgba(215,97,241,0.20) 100%)" }}>
                <span className="text-base font-bold text-foreground">
                  {username.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
          </div>
        </motion.div>
      ) : (
        <div className="w-14 h-14" aria-hidden="true" />
      )}

      <div className={rushStyles.balanceSelector}>
        <div className={rushStyles.balanceChip}>
          <div className={rushStyles.balanceMain} aria-label={`${activeBalanceCurrency} balance`}>
            <button
              type="button"
              className={`${rushStyles.balanceChevronBtn} ${isBalanceSelectorOpen ? rushStyles.balanceChevronBtnOpen : ""}`}
              onClick={() => setBalanceSelectorOpen((prev) => !prev)}
              aria-label="Toggle balance selector"
              aria-expanded={isBalanceSelectorOpen}
            >
              <ChevronUp size={14} strokeWidth={2.4} />
            </button>
            <AnimatePresence mode="wait" initial={false}>
              {activeBalanceCurrency === "TON" ? (
                <motion.img
                  key="staking-balance-icon-ton"
                  src="/ton.svg"
                  alt="TON"
                  className={rushStyles.tonIcon}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.16 }}
                />
              ) : (
                <motion.img
                  key="staking-balance-icon-stars"
                  src="/stars.svg"
                  alt="STARS"
                  className={rushStyles.starsIcon}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.16 }}
                />
              )}
            </AnimatePresence>

            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={`staking-balance-value-${activeBalanceCurrency}`}
                className={rushStyles.balanceValue}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.16 }}
              >
                {activeBalanceLabel}
              </motion.span>
            </AnimatePresence>
          </div>

          <button
            type="button"
            className={rushStyles.plusBtn}
            disabled={isRefreshingBalances}
            onClick={() => onRefreshBalances?.()}
            title={isRefreshingBalances ? "Обновление..." : "Обновить баланс"}
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
  )
}

