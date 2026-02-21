"use client"

import React, { useEffect, useState } from "react"

type WalletCurrency = "TON" | "STARS"
type WalletActionMode = "deposit" | "withdraw" | null

interface WalletActionModalProps {
  open: boolean
  mode: WalletActionMode
  isSubmitting?: boolean
  onClose: () => void
  onSubmit: (input: { amount: number; currency: WalletCurrency }) => Promise<void>
}

export function WalletActionModal({
  open,
  mode,
  isSubmitting = false,
  onClose,
  onSubmit,
}: WalletActionModalProps) {
  const [amountInput, setAmountInput] = useState("1")
  const [currency, setCurrency] = useState<WalletCurrency>("TON")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setAmountInput("1")
    setCurrency("TON")
    setError(null)
  }, [open, mode])

  if (!open || !mode) return null

  const title = mode === "deposit" ? "Пополнение кошелька" : "Вывод средств"
  const submitLabel = mode === "deposit" ? "Пополнить" : "Вывести"

  const handleSubmit = async () => {
    const amount = Number.parseFloat(amountInput)
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Введите корректную сумму")
      return
    }

    setError(null)
    await onSubmit({ amount, currency })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
      style={{ background: "rgba(6,9,22,0.72)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" } as React.CSSProperties}
    >
      <div
        className="w-full max-w-sm rounded-[18px] p-5"
        onClick={(event) => event.stopPropagation()}
        style={{
          background: "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%), var(--ui-surface-1, #141A3A)",
          border: "1px solid rgba(255,255,255,0.10)",
          boxShadow: "0 18px 48px rgba(4,7,22,0.54), 0 6px 18px rgba(11,17,38,0.30)",
        }}
      >
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Доступно только при включенном dev-флаге `ENABLE_DEV_WALLET_ACTIONS=1`.
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Сумма</label>
            <input
              type="number"
              min={0}
              step="0.000001"
              value={amountInput}
              onChange={(event) => setAmountInput(event.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40"
              placeholder="0.00"
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Валюта</label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {(["TON", "STARS"] as const).map((entry) => (
                <button
                  key={entry}
                  type="button"
                  onClick={() => setCurrency(entry)}
                  disabled={isSubmitting}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    currency === entry
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-secondary text-foreground"
                  }`}
                >
                  {entry}
                </button>
              ))}
            </div>
          </div>

          {error ? <p className="text-xs text-red-400">{error}</p> : null}
        </div>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 rounded-xl border border-border px-3 py-2 text-sm text-foreground disabled:opacity-60"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={() => {
              void handleSubmit()
            }}
            disabled={isSubmitting}
            className="flex-1 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {isSubmitting ? "Обработка..." : submitLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
