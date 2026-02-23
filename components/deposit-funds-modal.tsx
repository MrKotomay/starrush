"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { useTonConnectUI, useTonWallet } from "@tonconnect/ui-react"

type DepositMethod = "STARS" | "TON"

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

const PENDING_STATUSES: DepositIntentStatus[] = ["CREATED", "WAITING_PAYMENT", "SUBMITTED", "CONFIRMING"]

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
  const [method, setMethod] = useState<DepositMethod>("STARS")
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
        if (!response.ok || payload.ok !== true || !payload.intent) {
          return
        }

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

  const canClose = useMemo(
    () => !isSubmitting,
    [isSubmitting]
  )

  if (!open) return null

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
            setInfo("Платеж подтвержден, ждем зачисление")
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

    setSubmitting(true)
    setError(null)
    setInfo(null)

    try {
      if (!tonWallet?.account?.address) {
        await tonConnectUI.openModal()
      }

      const senderAddress = tonWallet?.account?.address
      if (!senderAddress) {
        setError("Подключите TON кошелек")
        return
      }

      const intentResponse = await fetch("/api/payments/ton/intent", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          amount,
          senderAddress,
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
      setInfo("TON транзакция отправлена, ожидаем подтверждение")
    } catch {
      setError("Не удалось отправить TON транзакцию")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={() => {
        if (!canClose) return
        onClose()
      }}
      style={{
        background: "rgba(6,9,22,0.72)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
      } as React.CSSProperties}
    >
      <div
        className="w-full max-w-sm rounded-[18px] p-5"
        onClick={(event) => event.stopPropagation()}
        style={{
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%), var(--ui-surface-1, #141A3A)",
          border: "1px solid rgba(255,255,255,0.10)",
          boxShadow: "0 18px 48px rgba(4,7,22,0.54), 0 6px 18px rgba(11,17,38,0.30)",
        }}
      >
        <h3 className="text-lg font-semibold text-foreground">Пополнение</h3>
        <p className="mt-1 text-xs text-muted-foreground">Выберите способ пополнения баланса</p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMethod("STARS")}
            disabled={isSubmitting}
            className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              method === "STARS"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-secondary text-foreground"
            }`}
          >
            Telegram Stars
          </button>
          <button
            type="button"
            onClick={() => setMethod("TON")}
            disabled={isSubmitting}
            className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              method === "TON"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-secondary text-foreground"
            }`}
          >
            TON Connect
          </button>
        </div>

        {method === "STARS" ? (
          <div className="mt-4 space-y-2">
            <label className="text-xs text-muted-foreground">Сумма Stars</label>
            <input
              type="number"
              min={1}
              step={1}
              value={starsAmountRaw}
              onChange={(event) => setStarsAmountRaw(event.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40"
              disabled={isSubmitting}
            />
            <button
              type="button"
              onClick={() => {
                void onPayStars()
              }}
              disabled={isSubmitting}
              className="w-full rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {isSubmitting ? "Создаем счет..." : "Оплатить Stars"}
            </button>
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            <label className="text-xs text-muted-foreground">Сумма TON</label>
            <input
              type="text"
              inputMode="decimal"
              value={tonAmountRaw}
              onChange={(event) => setTonAmountRaw(event.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40"
              disabled={isSubmitting}
            />
            <p className="text-[11px] text-muted-foreground">
              {tonWallet?.account?.address
                ? `Кошелек: ${tonWallet.account.address.slice(0, 8)}...${tonWallet.account.address.slice(-6)}`
                : "Кошелек не подключен"}
            </p>
            <button
              type="button"
              onClick={() => {
                void onPayTon()
              }}
              disabled={isSubmitting}
              className="w-full rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {isSubmitting ? "Отправляем транзакцию..." : "Оплатить TON"}
            </button>
          </div>
        )}

        {info ? <p className="mt-3 text-xs text-sky-300">{info}</p> : null}
        {error ? <p className="mt-3 text-xs text-red-400">{error}</p> : null}

        <button
          type="button"
          onClick={onClose}
          disabled={!canClose}
          className="mt-4 w-full rounded-xl border border-border px-3 py-2 text-sm text-foreground disabled:opacity-60"
        >
          Закрыть
        </button>
      </div>
    </div>
  )
}
