"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Gift, Sparkles, Wallet, X } from "lucide-react"
import { useTonConnectUI, useTonWallet } from "@tonconnect/ui-react"

import { PrimaryButton } from "@/components/ui/primary-button"
import { GlassSegmentedControl } from "@/components/ui/glass-segmented-control"
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

const METHOD_OPTIONS: Array<{
  id: DepositMethod
  label: string
  icon: React.ComponentType<{ className?: string }>
}> = [
  { id: "GIFTS", label: "Подарки", icon: Gift },
  { id: "TON", label: "TON", icon: Wallet },
  { id: "STARS", label: "Stars", icon: Sparkles },
]

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

function mapDepositError(code: string | undefined) {
  switch (code) {
    case "RATE_LIMIT":
      return "Слишком много запросов, попробуйте немного позже"
    case "STARS_PAYMENTS_DISABLED":
      return "Пополнение Stars сейчас отключено"
    case "TON_DEPOSITS_DISABLED":
      return "Пополнение TON сейчас отключено"
    case "TON_LIMITS_EXCEEDED":
      return "Сумма TON не входит в доступные лимиты"
    case "STARS_LIMITS_EXCEEDED":
      return "Сумма Stars не входит в доступные лимиты"
    case "TX_ALREADY_USED":
      return "Эта транзакция уже была использована"
    case "INTENT_NOT_FOUND":
      return "Платежная сессия не найдена"
    default:
      return "Не удалось выполнить пополнение"
  }
}

function mapIntentStatus(status: DepositIntentStatus, failureReason?: string | null) {
  if (status === "COMPLETED") return "Пополнение успешно зачислено"
  if (status === "FAILED") return failureReason || "Платеж отклонен"
  if (status === "EXPIRED") return "Время платежа истекло"
  if (status === "CANCELED") return "Платеж отменен"
  return "Платеж обрабатывается"
}

export function DepositFundsModal({ open, onClose, onCompleted }: DepositFundsModalProps) {
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

  const stackVariants = useMemo(
    () => ({
      hidden: { opacity: 0 },
      show: {
        opacity: 1,
        transition: {
          staggerChildren: shouldReduceMotion ? 0 : 0.045,
          delayChildren: shouldReduceMotion ? 0 : 0.03,
        },
      },
    }),
    [shouldReduceMotion],
  )

  const itemVariants = useMemo(
    () => ({
      hidden: shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 7 },
      show: {
        opacity: 1,
        y: 0,
        transition: {
          duration: shouldReduceMotion ? 0.1 : 0.22,
          ease: EASE,
        },
      },
    }),
    [shouldReduceMotion],
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
    if (!open) return
    if (!activeIntentId) return
    if (!activeIntentStatus || !PENDING_STATUSES.includes(activeIntentStatus)) return

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
        if (!response.ok || payload.ok !== true || !payload.intent) return

        if (cancelled) return
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
  }, [activeIntentId, activeIntentStatus, onCompleted, open])

  const canClose = useMemo(() => !isSubmitting, [isSubmitting])
  const methodItems = useMemo(
    () =>
      METHOD_OPTIONS.map((option) => ({
        id: option.id,
        label: option.label,
        icon: option.icon,
      })),
    [],
  )

  const onPayStars = async () => {
    const amount = toPositiveInt(starsAmountRaw)
    if (!amount) {
      setError("Введите корректную сумму Stars")
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
      setInfo("Откройте счет в Telegram и подтвердите оплату")

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
            setInfo("Платеж подтвержден, ожидаем зачисление")
          } else if (status === "cancelled") {
            setInfo("Оплата отменена")
          } else if (status === "failed") {
            setInfo("Оплата не прошла")
          }
        })
      } else {
        window.open(payload.invoiceUrl, "_blank", "noopener,noreferrer")
      }
    } catch {
      setError("Не удалось создать счет на оплату")
    } finally {
      setSubmitting(false)
    }
  }

  const onPayTon = async () => {
    const amount = toPositiveTon(tonAmountRaw)
    if (!amount) {
      setError("Введите корректную сумму TON")
      return
    }

    if (!tonWallet?.account?.address) {
      setError(null)
      setInfo("Подключите TON кошелек для продолжения")
      try {
        await tonConnectUI.openModal()
      } catch {
        setError("Не удалось открыть TON Connect")
      }
      return
    }

    setSubmitting(true)
    setError(null)
    setInfo(null)

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
      setInfo("TON транзакция отправлена, ожидаем подтверждение сети")
    } catch {
      setError("Не удалось отправить TON транзакцию")
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
          initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: shouldReduceMotion ? 0.1 : 0.2, ease: EASE }}
          onClick={() => {
            if (!canClose) return
            onClose()
          }}
        >
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-label="Пополнение баланса"
            className={styles.sheet}
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 34, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 30, scale: 0.98 }}
            transition={{ duration: shouldReduceMotion ? 0.1 : 0.24, ease: EASE }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.handle} />

            <div className={styles.header}>
              <div>
                <h3 className={styles.title}>Пополнение</h3>
                <p className={styles.subtitle}>Выберите способ и пополните баланс в пару шагов</p>
              </div>
              <button type="button" className={styles.closeBtn} onClick={onClose} disabled={!canClose} aria-label="Закрыть">
                <X size={16} />
              </button>
            </div>

            <GlassSegmentedControl
              items={methodItems}
              value={method}
              onChange={(next) => setMethod(next)}
              ariaLabel="Способы пополнения"
              layoutId="deposit-method-indicator"
              disabled={isSubmitting}
              className={styles.tabs}
            />

            <div className={styles.content}>
              <AnimatePresence mode="wait" initial={false}>
                {method === "GIFTS" ? (
                  <motion.div
                    key="deposit-gifts"
                    className={styles.giftStub}
                    variants={stackVariants}
                    initial="hidden"
                    animate="show"
                    exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
                    transition={{ duration: shouldReduceMotion ? 0.1 : 0.2, ease: EASE }}
                  >
                    <motion.span className={styles.giftIconWrap} variants={itemVariants}>
                      <Gift size={28} />
                    </motion.span>
                    <motion.p className={styles.giftTitle} variants={itemVariants}>
                      NFT Gifts
                    </motion.p>
                    <motion.p className={styles.giftDesc} variants={itemVariants}>
                      Раздел подарков подключим следующим шагом. Здесь будет импорт ваших подарков из Telegram.
                    </motion.p>
                    <motion.span className={styles.badgeSoon} variants={itemVariants}>
                      Скоро в MVP
                    </motion.span>
                    <motion.button type="button" className={styles.ghostBtn} disabled variants={itemVariants}>
                      Механика в разработке
                    </motion.button>
                  </motion.div>
                ) : null}

                {method === "TON" ? (
                    <motion.div
                      key="deposit-ton"
                      className={styles.contentStack}
                      variants={stackVariants}
                      initial="hidden"
                      animate="show"
                      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
                      transition={{ duration: shouldReduceMotion ? 0.1 : 0.2, ease: EASE }}
                    >
                      <motion.label className={styles.inputLabel} variants={itemVariants}>
                        Сумма TON
                      </motion.label>
                      <motion.input
                        type="text"
                        inputMode="decimal"
                        value={tonAmountRaw}
                        onChange={(event) => setTonAmountRaw(event.target.value)}
                        className={styles.input}
                        disabled={isSubmitting}
                        placeholder="0.50"
                        variants={itemVariants}
                      />

                      <motion.div className={styles.quickRow} variants={itemVariants}>
                        {TON_PRESETS.map((value) => (
                          <motion.button
                            key={value}
                            type="button"
                            className={styles.quickBtn}
                            disabled={isSubmitting}
                            onClick={() => setTonAmountRaw(value)}
                          >
                            {value} TON
                          </motion.button>
                        ))}
                      </motion.div>

                      <motion.p className={styles.walletHint} variants={itemVariants}>
                        {walletShortAddress ? `Кошелек подключен: ${walletShortAddress}` : "Кошелек не подключен"}
                      </motion.p>

                    <motion.div variants={itemVariants}>
                      <PrimaryButton
                        type="button"
                        onClick={() => void onPayTon()}
                        disabled={isSubmitting}
                        className={styles.primaryActionBtn}
                      >
                        {!walletShortAddress
                          ? "Подключить TON кошелек"
                          : isSubmitting
                            ? "Отправляем транзакцию..."
                            : "Оплатить через TON Connect"}
                      </PrimaryButton>
                    </motion.div>
                  </motion.div>
                ) : null}

                {method === "STARS" ? (
                    <motion.div
                      key="deposit-stars"
                      className={styles.contentStack}
                      variants={stackVariants}
                      initial="hidden"
                      animate="show"
                      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
                      transition={{ duration: shouldReduceMotion ? 0.1 : 0.2, ease: EASE }}
                    >
                      <motion.label className={styles.inputLabel} variants={itemVariants}>
                        Сумма Stars
                      </motion.label>
                      <motion.input
                        type="number"
                        min={1}
                        step={1}
                        value={starsAmountRaw}
                        onChange={(event) => setStarsAmountRaw(event.target.value)}
                        className={styles.input}
                        disabled={isSubmitting}
                        placeholder="100"
                        variants={itemVariants}
                      />

                      <motion.div className={styles.quickRow} variants={itemVariants}>
                        {STARS_PRESETS.map((value) => (
                          <motion.button
                            key={value}
                            type="button"
                            className={styles.quickBtn}
                            disabled={isSubmitting}
                            onClick={() => setStarsAmountRaw(String(value))}
                          >
                            {value}
                          </motion.button>
                        ))}
                      </motion.div>

                      <motion.p className={styles.walletHint} variants={itemVariants}>
                        Оплата пройдет через Telegram Invoice
                      </motion.p>

                    <motion.div variants={itemVariants}>
                      <PrimaryButton
                        type="button"
                        onClick={() => void onPayStars()}
                        disabled={isSubmitting}
                        className={styles.primaryActionBtn}
                      >
                        {isSubmitting ? "Создаем счет..." : "Оплатить Stars"}
                      </PrimaryButton>
                    </motion.div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>

            {info ? (
              <motion.p
                className={styles.statusInfo}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: shouldReduceMotion ? 0.1 : 0.16 }}
              >
                {info}
              </motion.p>
            ) : null}

            {error ? (
              <motion.p
                className={styles.statusError}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: shouldReduceMotion ? 0.1 : 0.16 }}
              >
                {error}
              </motion.p>
            ) : null}
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
