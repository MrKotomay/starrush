"use client"

import { useEffect, useMemo, useState, type CSSProperties } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"

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

type VisibleTab = Exclude<PlaceBetTab, "GIFTS">

type SliderStyle = CSSProperties & {
  "--slider-fill"?: string
}

const TON_QUICK = [0.1, 0.5, 1, 5]
const STARS_QUICK = [1, 5, 10, 25]
const SHEET_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]
const BALANCE_ICON_SRC = "/figma/place-bet-balance-icon.svg"
const CTA_ARROW_SRC = "/figma/place-bet-arrow.svg"

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

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

function formatBalance(value: number) {
  return Math.max(0, value).toFixed(2)
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

function formatSliderValue(value: number, isTonTab: boolean) {
  return isTonTab ? formatTon(value) : String(Math.round(value))
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
  const [tab, setTab] = useState<VisibleTab>("TON")
  const [tonAmountRaw, setTonAmountRaw] = useState("")
  const [starsAmountRaw, setStarsAmountRaw] = useState("")

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!open) return
    setTab("TON")
    setTonAmountRaw(defaultTonAmount > 0 ? formatTon(defaultTonAmount) : formatTon(1))
    setStarsAmountRaw(String(STARS_QUICK[2]))
  }, [defaultTonAmount, open])

  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    const onEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSubmitting) onOpenChange(false)
    }

    window.addEventListener("keydown", onEsc)

    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener("keydown", onEsc)
    }
  }, [isSubmitting, onOpenChange, open])

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

  const isTonTab = tab === "TON"
  const tonAmountValue = useMemo(() => parseTon(tonAmountRaw), [tonAmountRaw])
  const starsAmountValue = useMemo(() => parseStars(starsAmountRaw), [starsAmountRaw])
  const balanceValue = isTonTab ? Math.max(0, tonAvailable) : Math.max(0, starsAvailable)
  const parsedAmount = isTonTab ? tonAmountValue : starsAmountValue
  const currentValue = isTonTab ? tonAmountRaw : starsAmountRaw
  const amountTicker = isTonTab ? "TON" : "STARS"
  const balanceTicker = isTonTab ? "TON" : "STARS"
  const balanceNumber = formatBalance(balanceValue)

  const canSubmit = currentValue.trim() !== "" && parsedAmount > 0
  const insufficientBalance = canSubmit && parsedAmount > balanceValue
  const submitDisabled = !canSubmit || insufficientBalance || isSubmitting
  const canClose = !isSubmitting

  const sliderConfig = useMemo(() => {
    if (isTonTab) {
      const min = TON_QUICK[0]
      const baseMax = TON_QUICK[TON_QUICK.length - 1]
      const balanceMax = Math.ceil(Math.max(0, tonAvailable) * 10) / 10
      const currentMax = Math.ceil(Math.max(0, tonAmountValue) * 10) / 10
      const max = Math.max(min, baseMax, balanceMax, currentMax)

      return {
        min,
        max,
        step: 0.1,
        value: clamp(tonAmountValue > 0 ? tonAmountValue : min, min, max),
      }
    }

    const min = STARS_QUICK[0]
    const baseMax = STARS_QUICK[STARS_QUICK.length - 1]
    const balanceMax = Math.floor(Math.max(0, starsAvailable))
    const currentMax = Math.floor(Math.max(0, starsAmountValue))
    const max = Math.max(min, baseMax, balanceMax, currentMax)

    return {
      min,
      max,
      step: 1,
      value: clamp(starsAmountValue > 0 ? starsAmountValue : min, min, max),
    }
  }, [isTonTab, starsAmountValue, starsAvailable, tonAmountValue, tonAvailable])

  const sliderProgress = `${((sliderConfig.value - sliderConfig.min) / (sliderConfig.max - sliderConfig.min || 1)) * 100}%`
  const sliderStyle: SliderStyle = { "--slider-fill": sliderProgress }

  const goesToNextRound =
    currentPhase === RoundPhase.RUNNING ||
    currentPhase === RoundPhase.CRASHED ||
    currentPhase === RoundPhase.RESETTING

  const roundTargetLabel = goesToNextRound ? t("placeBet.nextRound") : t("placeBet.currentRound")
  const submitText = isSubmitting ? t("placeBet.submitting") : t("placeBet.submit")
  const submitHint = insufficientBalance ? t("placeBet.insufficientShort") : roundTargetLabel

  const sheetStyle = useMemo<CSSProperties>(() => {
    const viewportWidth = typeof window === "undefined" ? 420 : window.innerWidth
    const horizontalInset = viewportWidth <= 460 || !anchorRect || anchorRect.width <= 0 ? 0 : 24
    const sheetWidth = Math.min(390, viewportWidth - horizontalInset * 2)

    return {
      width: `${Math.round(sheetWidth)}px`,
    }
  }, [anchorRect])

  const tabOptions = useMemo(
    () => [
      { id: "STARS" as const, label: t("placeBet.stars"), disabled: false },
      { id: "TON" as const, label: "TON", disabled: false },
      { id: "USDT" as const, label: "USDT", disabled: true },
    ],
    [t],
  )

  if (!mounted) return null

  return createPortal(
    <AnimatePresence
      onExitComplete={() => {
        delete document.body.dataset.placeBetModalOpen
      }}
    >
      {open ? (
        <motion.div
          className={styles.backdrop}
          onClick={() => {
            if (!canClose) return
            onOpenChange(false)
          }}
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: adaptiveOverlayMotion ? 0.14 : 0.22, ease: SHEET_EASE }}
        >
          <motion.div
            className={styles.sheet}
            style={sheetStyle}
            role="dialog"
            aria-modal="true"
            aria-label={`${t("placeBet.title")} ${roundTargetLabel}`}
            onClick={(event) => event.stopPropagation()}
            initial={shouldReduceMotion ? { opacity: 0 } : { y: 24, opacity: 0, scale: 0.986 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { y: 16, opacity: 0, scale: 0.992 }}
            transition={{ duration: adaptiveOverlayMotion ? 0.16 : 0.22, ease: SHEET_EASE }}
          >
            <div className={styles.handleSlot}>
              <div className={styles.handle} />
            </div>

            <div className={styles.headerBlock}>
              <div className={styles.headerCopy}>
                <h3 className={styles.title}>{t("placeBet.title")}</h3>
                <p className={styles.subtitle}>{t("placeBet.subtitle")}</p>
              </div>

              <div className={styles.balanceCard}>
                <div className={styles.balanceCopy}>
                  <span className={styles.balanceLabel}>{t("placeBet.availableBalance")}</span>
                  <div className={styles.balanceValue}>
                    <span className={styles.balanceNumber}>{balanceNumber}</span>
                    <span className={styles.balanceTicker}>{balanceTicker}</span>
                  </div>
                </div>

                <div className={styles.balanceIconShell} aria-hidden="true">
                  <img src={BALANCE_ICON_SRC} alt="" className={styles.balanceIcon} />
                </div>
              </div>

              <div className={styles.tabRail} role="tablist" aria-label={t("placeBet.currencyAria")}>
                {tabOptions.map((item) => {
                  const isActive = !item.disabled && tab === item.id

                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      aria-disabled={item.disabled}
                      className={styles.tabButton}
                      onClick={() => {
                        if (item.disabled || isSubmitting) return
                        setTab(item.id as VisibleTab)
                      }}
                      disabled={item.disabled || isSubmitting}
                    >
                      {isActive ? <motion.span layoutId="place-bet-tab-fill" className={styles.tabActiveFill} /> : null}
                      <span className={styles.tabLabel}>{item.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <motion.div
              key={tab}
              className={styles.contentViewport}
              initial={adaptiveOverlayMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={adaptiveOverlayMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
              transition={{ duration: adaptiveOverlayMotion ? 0.12 : 0.18, ease: SHEET_EASE }}
            >
              <div className={styles.amountSection} style={sliderStyle}>
                <div className={styles.amountHeader}>
                  <span className={styles.amountLabel}>{t("placeBet.amount")}</span>

                  <div className={styles.amountDisplay}>
                    <input
                      className={styles.amountInput}
                      type="text"
                      disabled={isSubmitting}
                      aria-label={t("placeBet.amount")}
                      inputMode={isTonTab ? "decimal" : "numeric"}
                      value={currentValue}
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
                          return
                        }

                        setStarsAmountRaw((prev) => sanitizeStarsInput(prev))
                      }}
                      placeholder={isTonTab ? "0.00" : "0"}
                    />

                    <div className={styles.amountMeta}>
                      <span className={styles.amountCurrency}>{amountTicker}</span>
                      <div className={styles.maxBetBadge}>
                        <span className={styles.maxBetText}>{t("placeBet.maxBet")}</span>
                        <span className={styles.maxBetLine} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className={styles.sliderWrap}>
                  <input
                    type="range"
                    className={styles.slider}
                    min={sliderConfig.min}
                    max={sliderConfig.max}
                    step={sliderConfig.step}
                    value={sliderConfig.value}
                    disabled={isSubmitting}
                    onChange={(event) => {
                      const nextValue = Number.parseFloat(event.target.value)
                      if (isTonTab) {
                        setTonAmountRaw(formatTon(nextValue))
                        return
                      }

                      setStarsAmountRaw(String(Math.round(nextValue)))
                    }}
                  />
                </div>

                <div className={styles.sliderMeta}>
                  <span>
                    {t("placeBet.minShort")}: {formatSliderValue(sliderConfig.min, isTonTab)}
                  </span>
                  <span>
                    {t("placeBet.maxShort")}: {formatSliderValue(sliderConfig.max, isTonTab)}
                  </span>
                </div>
              </div>
            </motion.div>

            <div className={styles.ctaSection}>
              <motion.button
                type="button"
                className={styles.submitButton}
                disabled={submitDisabled}
                aria-busy={isSubmitting}
                aria-label={`${submitText}. ${submitHint}`}
                title={submitHint}
                whileHover={shouldReduceMotion || submitDisabled ? undefined : { y: -1, scale: 1.01 }}
                whileTap={shouldReduceMotion || submitDisabled ? undefined : { scale: 0.99 }}
                onClick={async () => {
                  if (submitDisabled) return
                  await Promise.resolve(onSubmit({ tab, amount: parsedAmount }))
                }}
              >
                <span className={styles.submitGlow} />
                <span className={styles.submitText}>{submitText}</span>
                <img src={CTA_ARROW_SRC} alt="" className={styles.submitArrow} />
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}
