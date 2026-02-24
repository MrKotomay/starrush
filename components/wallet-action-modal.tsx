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
      style={{ background: "rgba(5,8,24,0.76)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" } as React.CSSProperties}
    >
      <div
        className="glass-sheet w-full max-w-sm p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Доступно только при включенном dev-флаге `ENABLE_DEV_WALLET_ACTIONS=1`.
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Сумма</label>
            <input
              type="number"
              min={0}
              step="0.000001"
              value={amountInput}
              onChange={(event) => setAmountInput(event.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-background/60 px-3 py-2.5 text-sm font-semibold text-foreground outline-none transition-[border-color,box-shadow] duration-150 focus-visible:border-brand-soft/50 focus-visible:shadow-[0_0_0_2px_hsl(var(--brand-1)/0.14)]"
              placeholder="0.00"
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Валюта</label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {(["TON", "STARS"] as const).map((entry) => (
                <button
                  key={entry}
                  type="button"
                  onClick={() => setCurrency(entry)}
                  disabled={isSubmitting}
                  className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition-all duration-150 ${
                    currency === entry
                      ? "border-brand-soft/40 bg-brand-1/20 text-foreground shadow-[0_0_12px_rgba(101,29,203,0.14)]"
                      : "border-white/8 bg-surface-2/60 text-muted-foreground hover:border-white/14"
                  }`}
                >
                  {entry}
                </button>
              ))}
            </div>
          </div>

          {error ? <p className="text-xs font-medium text-danger">{error}</p> : null}
        </div>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="btn-secondary focus-brand flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold disabled:opacity-50"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={() => {
              void handleSubmit()
            }}
            disabled={isSubmitting}
            className="btn-primary-glow focus-brand flex-1 rounded-xl px-3 py-2.5 text-sm font-bold disabled:opacity-50"
          >
            {isSubmitting ? "Обработка..." : submitLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
