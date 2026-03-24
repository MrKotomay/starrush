"use client"

import React, { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { UserRejectsError } from "@tonconnect/sdk"
import { useTonConnectUI, useTonWallet } from "@tonconnect/ui-react"
import { Gift, Sparkles, Wallet, X } from "lucide-react"

import { formatCurrencyAmount } from "@/lib/currency"
import { useI18n } from "@/lib/i18n"
import { useAdaptiveOverlayMotion } from "@/lib/use-adaptive-overlay-motion"
import styles from "@/styles/deposit-funds-modal.module.css"

type DepositMethod = "GIFTS" | "STARS" | "TON"

type DepositIntentStatus =
  | "CREATED"
  | "WAITING_PAYMENT"
  | "SUBMITTED"
  | "CONFIRMING"
  | "COMPLETED"
  | "FAILED"
  | "EXPIRED"
  | "CANCELED"

interface DepositFundsModalProps {
  open: boolean
  onClose: () => void
  onCompleted?: () => void
  tonBalance?: number
  starsBalance?: number
}

type IntentResponse = {
  ok?: boolean
  error?: string
  intent?: {
    id: string
    status: DepositIntentStatus
    failureReason?: string | null
  }
}

type SliderStyle = CSSProperties & {
  "--slider-fill"?: string
}

const STARS_PRESETS = [50, 100, 250, 500]
const TON_PRESETS = ["0.25", "0.5", "1", "2"]
const TON_MIN = 0.25
const TON_MAX = 5
const TON_STEP = 0.25
const STARS_MIN = 50
const STARS_MAX = 500
const STARS_STEP = 10
const PENDING_STATUSES: DepositIntentStatus[] = ["CREATED", "WAITING_PAYMENT", "SUBMITTED", "CONFIRMING"]
const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

function toPositiveInt(raw: string): number | null {
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return parsed
}

function toPositiveTon(raw: string): string | null {
  const normalized = raw.trim().replace(",", ".")
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null
  const value = Number.parseFloat(normalized)
  if (!Number.isFinite(value) || value <= 0) return null
  return normalized
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function sanitizeTonInput(raw: string) {
  const normalized = raw.replace(",", ".").replace(/[^\d.]/g, "")
  const [head, ...tail] = normalized.split(".")
  return tail.length > 0 ? `${head}.${tail.join("")}` : head
}

function sanitizeStarsInput(raw: string) {
  return raw.replace(/[^\d]/g, "")
}

function formatTonInput(value: number) {
  return value.toFixed(2).replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1")
}

export function DepositFundsModal({
  open,
  onClose,
  onCompleted,
  tonBalance = 0,
  starsBalance = 0,
}: DepositFundsModalProps) {
  const { t } = useI18n()
  const [method, setMethod] = useState<DepositMethod>("TON")
  const [starsAmountRaw, setStarsAmountRaw] = useState("100")
  const [tonAmountRaw, setTonAmountRaw] = useState("0.5")
  const [isSubmitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [activeIntentId, setActiveIntentId] = useState<string | null>(null)
  const [activeIntentStatus, setActiveIntentStatus] = useState<DepositIntentStatus | null>(null)

  const [tonConnectUI] = useTonConnectUI()
  const tonWallet = useTonWallet()
  const completionFiredRef = useRef(false)
  const shouldReduceMotion = useReducedMotion()
  const adaptiveOverlayMotion = useAdaptiveOverlayMotion()

  const methodItems = useMemo(
    () => [
      { id: "GIFTS" as const, label: t("deposit.gifts"), icon: Gift },
      { id: "TON" as const, label: t("common.ton"), icon: Wallet },
      { id: "STARS" as const, label: t("deposit.stars"), icon: Sparkles },
    ],
    [t],
  )

  const mapDepositError = useMemo(
    () => (code: string | undefined) => {
      switch (code) {
        case "RATE_LIMIT":
          return t("deposit.error.rateLimit")
        case "STARS_PAYMENTS_DISABLED":
          return t("deposit.error.starsDisabled")
        case "TON_DEPOSITS_DISABLED":
          return t("deposit.error.tonDisabled")
        case "TON_DEPOSIT_ADDRESS_NOT_CONFIGURED":
        case "TON_DEPOSIT_ADDRESS_INVALID":
          return t("deposit.error.tonWalletInvalid")
        case "TON_LIMITS_EXCEEDED":
          return t("deposit.error.tonLimits")
        case "STARS_LIMITS_EXCEEDED":
          return t("deposit.error.starsLimits")
        case "TX_ALREADY_USED":
          return t("deposit.error.txUsed")
        case "INTENT_NOT_FOUND":
          return t("deposit.error.intentNotFound")
        default:
          return t("deposit.error.generic")
      }
    },
    [t],
  )

  const mapIntentStatus = useMemo(
    () => (status: DepositIntentStatus, failureReason?: string | null) => {
      if (status === "COMPLETED") return t("deposit.status.completed")
      if (status === "FAILED") return failureReason || t("deposit.status.failed")
      if (status === "EXPIRED") return t("deposit.status.expired")
      if (status === "CANCELED") return t("deposit.status.canceled")
      return t("deposit.status.pending")
    },
    [t],
  )

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    setError(null)
    setInfo(null)
    setActiveIntentId(null)
    setActiveIntentStatus(null)
    completionFiredRef.current = false
  }, [open])

  useEffect(() => {
    setError(null)
    setInfo(null)
  }, [method])

  useEffect(() => {
    if (!open || !activeIntentId || !activeIntentStatus || !PENDING_STATUSES.includes(activeIntentStatus)) return

    let cancelled = false
    const interval = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/payments/intents/${activeIntentId}`, {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          headers: { Accept: "application/json" },
        })

        const payload = (await response.json().catch(() => ({}))) as IntentResponse
        if (!response.ok || payload.ok !== true || !payload.intent || cancelled) return

        setActiveIntentStatus(payload.intent.status)
        setInfo(mapIntentStatus(payload.intent.status, payload.intent.failureReason))

        if (payload.intent.status === "COMPLETED" && !completionFiredRef.current) {
          completionFiredRef.current = true
          onCompleted?.()
        }
      } catch {
        // keep polling
      }
    }, 2200)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [activeIntentId, activeIntentStatus, mapIntentStatus, onCompleted, open])

  const canClose = !isSubmitting

  const onPayStars = async () => {
    const amount = toPositiveInt(starsAmountRaw)
    if (!amount) {
      setError(t("deposit.error.invalidStars"))
      return
    }

    setSubmitting(true)
    setError(null)
    setInfo(null)

    try {
      const response = await fetch("/api/payments/stars/invoice", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ amount }),
      })

      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
        invoiceUrl?: string
        intent?: { id: string; status: DepositIntentStatus }
      }

      if (!response.ok || payload.ok !== true || !payload.invoiceUrl || !payload.intent) {
        setError(mapDepositError(payload.error))
        return
      }

      setActiveIntentId(payload.intent.id)
      setActiveIntentStatus(payload.intent.status)
      setInfo(t("deposit.infoOpenInvoice"))

      const tg = (window as unknown as {
        Telegram?: {
          WebApp?: {
            openInvoice?: (url: string, callback?: (status: string) => void) => void
          }
        }
      }).Telegram?.WebApp

      if (tg?.openInvoice) {
        tg.openInvoice(payload.invoiceUrl, (status) => {
          if (status === "paid") {
            setInfo(t("deposit.infoPaymentConfirmed"))
          } else if (status === "cancelled") {
            setInfo(t("deposit.infoPaymentCanceled"))
          } else if (status === "failed") {
            setInfo(t("deposit.infoPaymentFailed"))
          }
        })
      } else {
        window.open(payload.invoiceUrl, "_blank", "noopener,noreferrer")
      }
    } catch {
      setError(t("deposit.error.createInvoice"))
    } finally {
      setSubmitting(false)
    }
  }

  const onPayTon = async () => {
    const amount = toPositiveTon(tonAmountRaw)
    if (!amount) {
      setError(t("deposit.error.invalidTon"))
      return
    }

    if (!tonWallet?.account?.address) {
      setError(null)
      setInfo(t("deposit.infoWalletRequired"))
      try {
        await tonConnectUI.openModal()
      } catch {
        setError(t("deposit.error.openTonConnect"))
      }
      return
    }

    setSubmitting(true)
    setError(null)
    setInfo(null)

    let createdIntentId: string | null = null

    try {
      const intentResponse = await fetch("/api/payments/ton/intent", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          amount,
          senderAddress: tonWallet.account.address,
        }),
      })

      const intentPayload = (await intentResponse.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
        tonConnectRequest?: {
          validUntil: number
          messages: Array<{ address: string; amount: string; payload?: string }>
        }
        intent?: { id: string; status: DepositIntentStatus }
      }

      if (!intentResponse.ok || intentPayload.ok !== true || !intentPayload.tonConnectRequest || !intentPayload.intent) {
        setError(mapDepositError(intentPayload.error))
        return
      }

      createdIntentId = intentPayload.intent.id
      setActiveIntentId(intentPayload.intent.id)
      setActiveIntentStatus(intentPayload.intent.status)
      setInfo(mapIntentStatus(intentPayload.intent.status))

      const txResult = await tonConnectUI.sendTransaction(intentPayload.tonConnectRequest)

      const submitResponse = await fetch("/api/payments/ton/submit", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          intentId: intentPayload.intent.id,
          boc: txResult.boc,
        }),
      })

      const submitPayload = (await submitResponse.json().catch(() => ({}))) as IntentResponse
      if (!submitResponse.ok || submitPayload.ok !== true || !submitPayload.intent) {
        setError(mapDepositError(submitPayload.error))
        return
      }

      setActiveIntentId(intentPayload.intent.id)
      setActiveIntentStatus(submitPayload.intent.status)
      setInfo(t("deposit.infoTonSubmitted"))
    } catch (submitError) {
      if (submitError instanceof UserRejectsError && createdIntentId) {
        try {
          const cancelResponse = await fetch("/api/payments/ton/cancel", {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              intentId: createdIntentId,
              reason: "USER_REJECTED",
            }),
          })

          const cancelPayload = (await cancelResponse.json().catch(() => ({}))) as IntentResponse
          if (cancelResponse.ok && cancelPayload.ok === true && cancelPayload.intent) {
            setActiveIntentStatus(cancelPayload.intent.status)
            setInfo(mapIntentStatus(cancelPayload.intent.status, cancelPayload.intent.failureReason))
            return
          }
        } catch {
          // fall through to generic error state
        }
      }

      setError(t("deposit.error.sendTon"))
    } finally {
      setSubmitting(false)
    }
  }

  const walletShortAddress = tonWallet?.account?.address
    ? `${tonWallet.account.address.slice(0, 8)}...${tonWallet.account.address.slice(-6)}`
    : null

  const tonNumericAmount = useMemo(() => {
    const value = toPositiveTon(tonAmountRaw)
    return value ? Number.parseFloat(value) : TON_MIN
  }, [tonAmountRaw])

  const starsNumericAmount = useMemo(() => {
    const value = toPositiveInt(starsAmountRaw)
    return value ?? STARS_MIN
  }, [starsAmountRaw])

  const activeCurrency = method === "TON" || method === "STARS" ? method : null
  const activeAmountValue = activeCurrency === "TON" ? tonNumericAmount : activeCurrency === "STARS" ? starsNumericAmount : 0

  const activeSlider = useMemo(() => {
    if (method === "TON") {
      return {
        min: TON_MIN,
        max: TON_MAX,
        step: TON_STEP,
        value: clamp(tonNumericAmount, TON_MIN, TON_MAX),
      }
    }

    return {
      min: STARS_MIN,
      max: STARS_MAX,
      step: STARS_STEP,
      value: clamp(starsNumericAmount, STARS_MIN, STARS_MAX),
    }
  }, [method, starsNumericAmount, tonNumericAmount])

  const sliderProgress =
    activeCurrency === null
      ? "0%"
      : `${((activeSlider.value - activeSlider.min) / (activeSlider.max - activeSlider.min || 1)) * 100}%`

  const currentBalanceLabel = useMemo(() => {
    if (method === "TON") {
      return `${formatCurrencyAmount("TON", tonBalance, { compactStars: false })} TON`
    }
    if (method === "STARS") {
      return `${formatCurrencyAmount("STARS", starsBalance, { compactStars: false })} ${t("common.stars")}`
    }
    return t("deposit.giftsSoon")
  }, [method, starsBalance, t, tonBalance])

  const summaryHeading = method === "TON" ? "TON Connect" : method === "STARS" ? "Telegram Invoice" : t("deposit.giftsSoon")
  const summaryBody =
    method === "TON"
      ? walletShortAddress
        ? t("deposit.walletConnected", { address: walletShortAddress })
        : t("deposit.walletNotConnected")
      : method === "STARS"
        ? t("deposit.openInvoiceHint")
        : t("deposit.giftsDesc")

  const actionLabel =
    method === "GIFTS"
      ? t("deposit.giftsDisabled")
      : method === "TON"
        ? !walletShortAddress
          ? t("deposit.connectWallet")
          : isSubmitting
            ? t("deposit.payTonSubmitting")
            : t("deposit.payTon")
        : isSubmitting
          ? t("deposit.payStarsSubmitting")
          : t("deposit.payStars")

  const amountLabel = activeCurrency ? formatCurrencyAmount(activeCurrency, activeAmountValue, { compactStars: false }) : null
  const amountUnit = method === "TON" ? "TON" : method === "STARS" ? t("common.stars") : null

  const feedbackTone = error ? "error" : activeIntentStatus === "COMPLETED" ? "success" : "info"
  const feedbackMessage = error ?? info
  const sliderStyle: SliderStyle | undefined =
    activeCurrency === null
      ? undefined
      : {
          "--slider-fill": sliderProgress,
        }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className={styles.overlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: adaptiveOverlayMotion ? 0.14 : shouldReduceMotion ? 0.1 : 0.2, ease: EASE }}
          onClick={() => {
            if (!canClose) return
            onClose()
          }}
        >
          <div className={styles.glowOne} />
          <div className={styles.glowTwo} />

          <motion.section
            role="dialog"
            aria-modal="true"
            aria-label={t("deposit.aria")}
            className={styles.sheet}
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 34, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.985 }}
            transition={{ duration: adaptiveOverlayMotion ? 0.16 : shouldReduceMotion ? 0.1 : 0.24, ease: EASE }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.edgeGlow} />
            <div className={styles.innerStroke} />

            <div className={styles.handle} />

            <div className={styles.header}>
              <div className={styles.headerCopy}>
                <h3 className={styles.title}>{t("deposit.title")}</h3>
                <p className={styles.subtitle}>{t("deposit.subtitle")}</p>
              </div>

              <div className={styles.headerAside}>
                <div className={styles.balanceMeta}>
                  <span className={styles.balanceMetaLabel}>{t("deposit.currentBalance")}</span>
                  <span className={styles.balanceMetaValue}>{currentBalanceLabel}</span>
                </div>

                <button
                  type="button"
                  className={styles.closeBtn}
                  onClick={onClose}
                  disabled={!canClose}
                  aria-label={t("common.close")}
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className={styles.tabs} role="tablist" aria-label={t("deposit.title")}>
              {methodItems.map((item) => {
                const active = item.id === method

                return (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    className={styles.tab}
                    data-active={active ? "true" : "false"}
                    onClick={() => setMethod(item.id)}
                    disabled={isSubmitting}
                  >
                    {active ? <motion.span layoutId="deposit-method-pill" className={styles.tabActiveFill} /> : null}
                    <item.icon size={15} className={styles.tabIcon} />
                    <span className={styles.tabLabel}>{item.label}</span>
                  </button>
                )
              })}
            </div>

            {method === "GIFTS" ? (
              <div className={styles.giftStage}>
                <div className={styles.giftOrb}>
                  <Gift size={20} />
                </div>
                <div className={styles.giftCopy}>
                  <p className={styles.giftTitle}>{t("deposit.giftsTitle")}</p>
                  <p className={styles.giftDescription}>{t("deposit.giftsDesc")}</p>
                </div>
                <button type="button" className={styles.disabledAction} disabled>
                  {t("deposit.giftsDisabled")}
                </button>
              </div>
            ) : (
              <>
                <div className={styles.amountStage} style={sliderStyle}>
                  <div className={styles.amountHeader}>
                    <span className={styles.amountCaption}>{t("common.amount")}</span>
                    <span className={styles.amountBalance}>{t("common.currency")}</span>
                  </div>

                  <div className={styles.amountValueRow}>
                    <input
                      type="text"
                      inputMode={method === "TON" ? "decimal" : "numeric"}
                      value={method === "TON" ? tonAmountRaw : starsAmountRaw}
                      onChange={(event) => {
                        if (method === "TON") {
                          setTonAmountRaw(sanitizeTonInput(event.target.value))
                        } else {
                          setStarsAmountRaw(sanitizeStarsInput(event.target.value))
                        }
                      }}
                      className={styles.amountInput}
                      disabled={isSubmitting}
                      aria-label={method === "TON" ? t("deposit.tonAmount") : t("deposit.starsAmount")}
                      placeholder={method === "TON" ? "0.5" : "100"}
                    />
                    <span className={styles.amountUnit}>{amountUnit}</span>
                  </div>

                  <input
                    type="range"
                    min={activeSlider.min}
                    max={activeSlider.max}
                    step={activeSlider.step}
                    value={activeSlider.value}
                    className={styles.slider}
                    disabled={isSubmitting}
                    onChange={(event) => {
                      const nextValue = Number.parseFloat(event.target.value)
                      if (method === "TON") {
                        setTonAmountRaw(formatTonInput(nextValue))
                      } else {
                        setStarsAmountRaw(String(Math.round(nextValue)))
                      }
                    }}
                  />

                  <div className={styles.sliderMeta}>
                    <span>
                      {t("deposit.minShort")}{" "}
                      {formatCurrencyAmount(method === "TON" ? "TON" : "STARS", activeSlider.min, {
                        compactStars: false,
                      })}
                    </span>
                    <span>
                      {t("deposit.maxShort")}{" "}
                      {formatCurrencyAmount(method === "TON" ? "TON" : "STARS", activeSlider.max, {
                        compactStars: false,
                      })}
                    </span>
                  </div>
                </div>

                <div className={styles.quickPicks}>
                  {(method === "TON" ? TON_PRESETS : STARS_PRESETS.map(String)).map((value) => {
                    const active =
                      method === "TON" ? toPositiveTon(tonAmountRaw) === value : String(toPositiveInt(starsAmountRaw) ?? "") === value

                    return (
                      <button
                        key={value}
                        type="button"
                        className={styles.presetBtn}
                        data-active={active ? "true" : "false"}
                        disabled={isSubmitting}
                        onClick={() => {
                          if (method === "TON") {
                            setTonAmountRaw(value)
                          } else {
                            setStarsAmountRaw(value)
                          }
                        }}
                      >
                        {active ? <motion.span layoutId="deposit-preset-pill" className={styles.presetActiveFill} /> : null}
                        <span className={styles.presetLabel}>{value}</span>
                      </button>
                    )
                  })}
                </div>

                <div className={styles.summaryPanel}>
                  <div className={styles.summaryTop}>
                    <div>
                      <span className={styles.summaryLabel}>{t("deposit.paymentChannel")}</span>
                      <span className={styles.summaryValue}>{summaryHeading}</span>
                    </div>
                    <div className={styles.summaryAmount}>
                      <span className={styles.summaryAmountValue}>{amountLabel}</span>
                      <span className={styles.summaryAmountUnit}>{amountUnit}</span>
                    </div>
                  </div>

                  <p className={styles.summaryHint}>{summaryBody}</p>

                  <motion.button
                    type="button"
                    className={styles.cta}
                    disabled={isSubmitting}
                    whileHover={shouldReduceMotion || isSubmitting ? undefined : { scale: 1.01, y: -1 }}
                    whileTap={shouldReduceMotion || isSubmitting ? undefined : { scale: 0.99 }}
                    onClick={() => {
                      if (method === "TON") {
                        void onPayTon()
                        return
                      }
                      if (method === "STARS") {
                        void onPayStars()
                      }
                    }}
                    data-method={method}
                  >
                    <span className={styles.ctaGlow} />
                    <span className={styles.ctaText}>{actionLabel}</span>
                  </motion.button>
                </div>
              </>
            )}

            {feedbackMessage ? (
              <p className={styles.feedback} data-tone={feedbackTone}>
                {feedbackMessage}
              </p>
            ) : null}
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
