"use client"

import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Gift, Sparkles, Wallet, X } from "lucide-react"

import { GlassSegmentedControl, type GlassSegmentedItem } from "@/components/ui/glass-segmented-control"
import { PrimaryButton } from "@/components/ui/primary-button"
import { RoundPhase } from "@/game/types"
import { useI18n } from "@/lib/i18n"
import { useAdaptiveOverlayMotion } from "@/lib/use-adaptive-overlay-motion"
import styles from "@/styles/place-bet-modal.module.css"

export type PlaceBetTab = "GIFTS" | "TON" | "STARS"

export interface PlaceBetSubmitPayload {
  tab: PlaceBetTab
  amount: number
}

interface PlaceBetModalProps {
  open: boolean
  defaultTonAmount: number
  currentPhase: RoundPhase
  tonAvailable: number
  starsAvailable: number
  anchorRect: { left: number; width: number } | null
  isSubmitting?: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (payload: PlaceBetSubmitPayload) => void | Promise<void>
}

const TON_QUICK = [0.1, 0.5, 1, 5]
const STARS_QUICK = [1, 5, 10, 25]
const SHEET_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

function parseTon(value: string): number {
  if (!value.trim()) return 0
  const parsed = Number.parseFloat(value.replace(",", "."))
  if (!Number.isFinite(parsed) || parsed <= 0) return 0
  return parsed
}

function formatTon(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return ""
  return value.toFixed(2).replace(/\.?0+$/, "")
}

function sanitizeTonInput(raw: string): string {
  const normalized = raw.replace(",", ".").replace(/[^\d.]/g, "")
  if (!normalized) return ""

  const dotIndex = normalized.indexOf(".")
  if (dotIndex === -1) return normalized

  const intPart = normalized.slice(0, dotIndex)
  const decimalsRaw = normalized.slice(dotIndex + 1).replace(/\./g, "")
  return `${intPart}.${decimalsRaw.slice(0, 2)}`
}

function isTonZeroRaw(value: string): boolean {
  if (!value) return false
  if (value.endsWith(".")) return false
  return /^0+(?:\.0{1,2})?$/.test(value)
}

function parseStars(value: string): number {
  if (!value.trim()) return 0
  const parsed = Number.parseInt(value.replace(/[^\d]/g, ""), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return 0
  return parsed
}

function sanitizeStarsInput(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "")
  if (!digits) return ""
  const parsed = Number.parseInt(digits, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return ""
  return String(parsed)
}

export function PlaceBetModal({
  open,
  defaultTonAmount,
  currentPhase,
  tonAvailable,
  starsAvailable,
  anchorRect,
  isSubmitting = false,
  onOpenChange,
  onSubmit,
}: PlaceBetModalProps) {
  const { t } = useI18n()
  const shouldReduceMotion = useReducedMotion()
  const adaptiveOverlayMotion = useAdaptiveOverlayMotion()
  const [mounted, setMounted] = useState(false)
  const [tab, setTab] = useState<PlaceBetTab>("TON")
  const [tonAmountRaw, setTonAmountRaw] = useState("")
  const [starsAmountRaw, setStarsAmountRaw] = useState("")

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!open) return
    setTab("TON")
    setTonAmountRaw(defaultTonAmount > 0 ? formatTon(defaultTonAmount) : "")
    setStarsAmountRaw("")
  }, [defaultTonAmount, open])

  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    const onEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false)
    }

    window.addEventListener("keydown", onEsc)

    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener("keydown", onEsc)
    }
  }, [open, onOpenChange])

  useEffect(() => {
    if (!mounted) return
    if (open) {
      document.body.dataset.placeBetModalOpen = "true"
      return
    }
    delete document.body.dataset.placeBetModalOpen
  }, [mounted, open])

  useEffect(() => {
    return () => {
      delete document.body.dataset.placeBetModalOpen
    }
  }, [])

  const tabItems: Array<GlassSegmentedItem<PlaceBetTab>> = useMemo(
    () => [
      { id: "GIFTS", label: t("placeBet.gifts"), icon: Gift },
      { id: "TON", label: t("common.ton"), icon: Wallet },
      { id: "STARS", label: t("placeBet.stars"), icon: Sparkles },
    ],
    [t],
  )

  const tonAmountValue = useMemo(() => parseTon(tonAmountRaw), [tonAmountRaw])
  const starsAmountValue = useMemo(() => parseStars(starsAmountRaw), [starsAmountRaw])

  const nextRoundHint =
    currentPhase === RoundPhase.RUNNING
      ? t("placeBet.nextRoundRunning")
      : currentPhase === RoundPhase.CRASHED || currentPhase === RoundPhase.RESETTING
        ? t("placeBet.nextRoundSwitching")
        : null

  const canSubmit =
    tab === "GIFTS" ||
    (tab === "TON" && tonAmountRaw.trim() !== "" && tonAmountValue > 0) ||
    (tab === "STARS" && starsAmountRaw.trim() !== "" && starsAmountValue > 0)

  const availableBalance =
    tab === "TON" ? Math.max(0, tonAvailable) : tab === "STARS" ? Math.max(0, starsAvailable) : 0
  const selectedAmount = tab === "TON" ? tonAmountValue : tab === "STARS" ? starsAmountValue : 0
  const insufficientBalance =
    tab !== "GIFTS" &&
    canSubmit &&
    selectedAmount > 0 &&
    Number.isFinite(selectedAmount) &&
    selectedAmount > availableBalance

  const submitDisabled = !canSubmit || isSubmitting || insufficientBalance
  const tonInputIsDefault = tonAmountRaw.trim() === "" || tonAmountValue <= 0
  const starsInputIsDefault = starsAmountRaw.trim() === "" || starsAmountValue <= 0
  const submitLabel = isSubmitting
    ? t("placeBet.submitting")
    : insufficientBalance
      ? t("placeBet.insufficient")
      : t("placeBet.submit")

  const anchorStyle = useMemo<CSSProperties | null>(() => {
    if (!anchorRect || anchorRect.width <= 0) return null
    return {
      left: `${Math.round(anchorRect.left)}px`,
      width: `${Math.round(anchorRect.width)}px`,
      maxWidth: `${Math.round(anchorRect.width)}px`,
    }
  }, [anchorRect])

  const renderTabContent = (targetTab: PlaceBetTab) => {
    if (targetTab === "GIFTS") {
      return (
        <div className={`${styles.contentInner} ${styles.contentInnerCentered}`}>
          <div className={styles.emptyWrap}>
            <X size={44} strokeWidth={2.5} className={styles.emptyIcon} />
            <p className={`${styles.emptyText} ${styles.mutedText}`}>{t("placeBet.emptyInventory")}</p>
          </div>
        </div>
      )
    }

    const isTonTab = targetTab === "TON"
    const quickValues = isTonTab ? TON_QUICK : STARS_QUICK
    const balanceLabel = isTonTab
      ? `${Math.max(0, tonAvailable).toFixed(2)} TON`
      : `${Math.floor(Math.max(0, starsAvailable))} ${t("common.stars")}`

    return (
      <div className={styles.contentInner}>
        <div className={styles.amountCard}>
          <div className={styles.amountHeader}>
            <span className={`${styles.amountLabel} ${styles.mutedText}`}>{t("placeBet.amount")}</span>
            <span className={`${styles.balanceLabel} ${styles.mutedText}`}>
              {t("placeBet.balance", { balance: balanceLabel })}
            </span>
          </div>

          <div className={styles.inputRow}>
            <input
              className={`${styles.amountInput} ${
                (isTonTab ? tonInputIsDefault : starsInputIsDefault) ? styles.amountInputMuted : ""
              }`}
              type="text"
              disabled={isSubmitting}
              inputMode={isTonTab ? "decimal" : "numeric"}
              value={isTonTab ? tonAmountRaw : starsAmountRaw}
              onChange={(event) => {
                if (isTonTab) {
                  const nextRaw = sanitizeTonInput(event.target.value)
                  setTonAmountRaw(isTonZeroRaw(nextRaw) ? "" : nextRaw)
                  return
                }
                setStarsAmountRaw(sanitizeStarsInput(event.target.value))
              }}
              onBlur={() => {
                if (isTonTab) {
                  const parsed = parseTon(tonAmountRaw)
                  setTonAmountRaw(parsed > 0 ? formatTon(parsed) : "")
                } else {
                  setStarsAmountRaw((prev) => sanitizeStarsInput(prev))
                }
              }}
              placeholder={isTonTab ? "0.00" : "0"}
            />
            <span className={`${styles.inputSuffix} ${styles.mutedText}`}>
              {isTonTab ? t("common.ton") : t("common.stars")}
            </span>
          </div>
        </div>

        <div className={styles.quickRow}>
          {quickValues.map((value) => {
            const isActiveQuick = isTonTab
              ? tonAmountRaw.trim() !== "" && Math.abs(tonAmountValue - value) < 0.0001
              : starsAmountRaw.trim() !== "" && starsAmountValue === value

            return (
              <button
                key={`${targetTab}-${value}`}
                type="button"
                className={`${styles.quickButton} ${isActiveQuick ? styles.quickButtonActive : ""}`}
                disabled={isSubmitting}
                aria-pressed={isActiveQuick}
                onClick={() => {
                  if (isTonTab) {
                    setTonAmountRaw(value > 0 ? String(value) : "")
                    return
                  }
                  setStarsAmountRaw(value > 0 ? String(value) : "")
                }}
              >
                <span className={styles.quickButtonText}>{value}</span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  if (!mounted || !anchorStyle) return null

  return createPortal(
    <AnimatePresence
      onExitComplete={() => {
        delete document.body.dataset.placeBetModalOpen
      }}
    >
      {open ? (
        <motion.div
          className={styles.backdrop}
          onClick={() => onOpenChange(false)}
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: adaptiveOverlayMotion ? 0.14 : 0.22, ease: SHEET_EASE }}
        >
          <motion.div
            className={styles.sheet}
            style={anchorStyle}
            role="dialog"
            aria-modal="true"
            aria-label={t("placeBet.title")}
            onClick={(event) => event.stopPropagation()}
            initial={shouldReduceMotion ? { opacity: 0 } : { y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { y: 16, opacity: 0 }}
            transition={{ duration: adaptiveOverlayMotion ? 0.16 : 0.24, ease: SHEET_EASE }}
          >
            <div className={styles.topSection}>
              <div className={styles.header}>
                <h3 className={styles.title}>{t("placeBet.title")}</h3>
                <button
                  type="button"
                  className={styles.closeButton}
                  aria-label={t("placeBet.close")}
                  onClick={() => onOpenChange(false)}
                >
                  <X size={19} strokeWidth={2} />
                </button>
              </div>

              <GlassSegmentedControl
                items={tabItems}
                value={tab}
                onChange={(next) => setTab(next)}
                ariaLabel={t("placeBet.currencyAria")}
                className={styles.tabs}
                layoutId="place-bet-tab-indicator"
                motionMode={adaptiveOverlayMotion ? "static" : "default"}
                disabled={isSubmitting}
              />

              {nextRoundHint ? <p className={styles.modeHint}>{nextRoundHint}</p> : null}
            </div>

            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={tab}
                className={styles.contentViewport}
                initial={adaptiveOverlayMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={adaptiveOverlayMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
                transition={{ duration: adaptiveOverlayMotion ? 0.12 : 0.18, ease: SHEET_EASE }}
              >
                {renderTabContent(tab)}
              </motion.div>
            </AnimatePresence>

            <div className={styles.footer}>
              <PrimaryButton
                type="button"
                className={`${styles.submitButton} ${isSubmitting ? styles.submitButtonLoading : ""}`}
                disabled={submitDisabled}
                aria-busy={isSubmitting}
                motion={adaptiveOverlayMotion ? "none" : "subtle"}
                onClick={async () => {
                  if (submitDisabled) return
                  const amount = tab === "TON" ? tonAmountValue : tab === "STARS" ? starsAmountValue : 0
                  await Promise.resolve(onSubmit({ tab, amount }))
                }}
              >
                <span className={styles.submitButtonContent}>
                  {insufficientBalance && !isSubmitting ? (
                    <Wallet size={18} strokeWidth={2.1} className={styles.submitWalletIcon} />
                  ) : null}
                  <span>{submitLabel}</span>
                </span>
              </PrimaryButton>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}
