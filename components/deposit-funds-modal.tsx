"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { UserRejectsError } from "@tonconnect/sdk"
import { useTonConnectUI, useTonWallet } from "@tonconnect/ui-react"
import { Gift, Sparkles, Wallet, X } from "lucide-react"

import { GlassSegmentedControl } from "@/components/ui/glass-segmented-control"
import { PrimaryButton } from "@/components/ui/primary-button"
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

const STARS_PRESETS = [50, 100, 250, 500]
const TON_PRESETS = ["0.25", "0.5", "1", "2"]
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

export function DepositFundsModal({ open, onClose, onCompleted }: DepositFundsModalProps) {
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
    } catch (error) {
      if (error instanceof UserRejectsError && createdIntentId) {
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
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-label={t("deposit.aria")}
            className={styles.sheet}
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 30, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 22, scale: 0.985 }}
            transition={{ duration: adaptiveOverlayMotion ? 0.16 : shouldReduceMotion ? 0.1 : 0.24, ease: EASE }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.handle} />

            <div className={styles.header}>
              <div>
                <h3 className={styles.title}>{t("deposit.title")}</h3>
                <p className={styles.subtitle}>{t("deposit.subtitle")}</p>
              </div>
              <button type="button" className={styles.closeBtn} onClick={onClose} disabled={!canClose} aria-label={t("common.close")}>
                <X size={16} />
              </button>
            </div>

            <GlassSegmentedControl
              items={methodItems}
              value={method}
              onChange={(next) => setMethod(next)}
              ariaLabel={t("deposit.title")}
              layoutId="deposit-method-indicator"
              motionMode={adaptiveOverlayMotion ? "static" : "default"}
              activeButtonChrome="off"
              disabled={isSubmitting}
              className={styles.tabs}
            />

            <div className={styles.content}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={method}
                  className={styles.contentStack}
                  initial={adaptiveOverlayMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={adaptiveOverlayMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
                  transition={{ duration: adaptiveOverlayMotion ? 0.12 : shouldReduceMotion ? 0.1 : 0.2, ease: EASE }}
                >
                  {method === "GIFTS" ? (
                    <div className={styles.giftStub}>
                      <span className={styles.giftIconWrap}>
                        <Gift size={28} />
                      </span>
                      <p className={styles.giftTitle}>{t("deposit.giftsTitle")}</p>
                      <p className={styles.giftDesc}>{t("deposit.giftsDesc")}</p>
                      <span className={styles.badgeSoon}>{t("deposit.giftsSoon")}</span>
                      <button type="button" className={styles.ghostBtn} disabled>
                        {t("deposit.giftsDisabled")}
                      </button>
                    </div>
                  ) : null}

                  {method === "TON" ? (
                    <>
                      <label className={styles.inputLabel}>{t("deposit.tonAmount")}</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={tonAmountRaw}
                        onChange={(event) => setTonAmountRaw(event.target.value)}
                        className={styles.input}
                        disabled={isSubmitting}
                        placeholder="0.50"
                      />

                      <div className={styles.quickRow}>
                        {TON_PRESETS.map((value) => {
                          const active = toPositiveTon(tonAmountRaw) === value
                          return (
                            <button
                              key={value}
                              type="button"
                              className={styles.quickBtn}
                              data-active={active ? "true" : "false"}
                              disabled={isSubmitting}
                              onClick={() => setTonAmountRaw(value)}
                            >
                              {value} TON
                            </button>
                          )
                        })}
                      </div>

                      <p className={styles.walletHint}>
                        {walletShortAddress
                          ? t("deposit.walletConnected", { address: walletShortAddress })
                          : t("deposit.walletNotConnected")}
                      </p>

                      <PrimaryButton
                        type="button"
                        onClick={() => void onPayTon()}
                        disabled={isSubmitting}
                        motion={adaptiveOverlayMotion ? "none" : "subtle"}
                        data-sheen={isSubmitting ? "off" : "event"}
                        className={styles.primaryActionBtn}
                      >
                        {!walletShortAddress
                          ? t("deposit.connectWallet")
                          : isSubmitting
                            ? t("deposit.payTonSubmitting")
                            : t("deposit.payTon")}
                      </PrimaryButton>
                    </>
                  ) : null}

                  {method === "STARS" ? (
                    <>
                      <label className={styles.inputLabel}>{t("deposit.starsAmount")}</label>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={starsAmountRaw}
                        onChange={(event) => setStarsAmountRaw(event.target.value)}
                        className={styles.input}
                        disabled={isSubmitting}
                        placeholder="100"
                      />

                      <div className={styles.quickRow}>
                        {STARS_PRESETS.map((value) => {
                          const active = starsAmountRaw.trim() === String(value)
                          return (
                            <button
                              key={value}
                              type="button"
                              className={styles.quickBtn}
                              data-active={active ? "true" : "false"}
                              disabled={isSubmitting}
                              onClick={() => setStarsAmountRaw(String(value))}
                            >
                              {value}
                            </button>
                          )
                        })}
                      </div>

                      <p className={styles.walletHint}>{t("deposit.openInvoiceHint")}</p>

                      <PrimaryButton
                        type="button"
                        onClick={() => void onPayStars()}
                        disabled={isSubmitting}
                        motion={adaptiveOverlayMotion ? "none" : "subtle"}
                        data-sheen={isSubmitting ? "off" : "event"}
                        className={styles.primaryActionBtn}
                      >
                        {isSubmitting ? t("deposit.payStarsSubmitting") : t("deposit.payStars")}
                      </PrimaryButton>
                    </>
                  ) : null}
                </motion.div>
              </AnimatePresence>
            </div>

            {info ? <p className={styles.statusInfo}>{info}</p> : null}
            {error ? <p className={styles.statusError}>{error}</p> : null}
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
