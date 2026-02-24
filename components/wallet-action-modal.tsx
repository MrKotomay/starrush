"use client"

import React, { useEffect, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Sparkles, Wallet, X } from "lucide-react"

import { PrimaryButton } from "@/components/ui/primary-button"
import { GlassSegmentedControl, type GlassSegmentedItem } from "@/components/ui/glass-segmented-control"

type WalletCurrency = "TON" | "STARS"
type WalletActionMode = "deposit" | "withdraw" | null

interface WalletActionModalProps {
  open: boolean
  mode: WalletActionMode
  isSubmitting?: boolean
  onClose: () => void
  onSubmit: (input: { amount: number; currency: WalletCurrency }) => Promise<void>
}

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]
const CURRENCY_ITEMS: Array<GlassSegmentedItem<WalletCurrency>> = [
  { id: "TON", label: "TON", icon: Wallet },
  { id: "STARS", label: "Stars", icon: Sparkles },
]

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
  const shouldReduceMotion = useReducedMotion()

  useEffect(() => {
    if (!open) return
    setAmountInput("1")
    setCurrency("TON")
    setError(null)
  }, [open, mode])

  if (!mode) return null

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
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[95] flex items-center justify-center p-4"
          onClick={onClose}
          style={{ background: "rgba(6,9,22,0.74)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" } as React.CSSProperties}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: shouldReduceMotion ? 0.1 : 0.2, ease: EASE }}
        >
          <motion.section
            className="w-full max-w-sm rounded-[var(--radius-xl)] border border-white/12 p-4 shadow-[0_24px_58px_rgba(4,8,22,0.52)]"
            onClick={(event) => event.stopPropagation()}
            style={{
              background:
                "linear-gradient(160deg, rgba(34,42,84,0.92) 0%, rgba(20,26,58,0.94) 54%, rgba(13,18,44,0.96) 100%)",
            }}
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.985 }}
            transition={{ duration: shouldReduceMotion ? 0.1 : 0.22, ease: EASE }}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-foreground">{title}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Доступно только при dev-флаге `ENABLE_DEV_WALLET_ACTIONS=1`.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                aria-label="Закрыть"
                className="focus-brand inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/16 bg-white/6 text-muted-foreground transition-colors duration-200 hover:text-foreground"
              >
                <X size={15} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Сумма</label>
                <input
                  type="number"
                  min={0}
                  step="0.000001"
                  value={amountInput}
                  onChange={(event) => setAmountInput(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-white/14 bg-background/70 px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-brand-soft/60"
                  placeholder="0.00"
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Валюта</label>
                <GlassSegmentedControl
                  className="mt-1.5"
                  items={CURRENCY_ITEMS}
                  value={currency}
                  onChange={(next) => setCurrency(next)}
                  ariaLabel="Валюта операции"
                  layoutId="wallet-action-currency-indicator"
                  disabled={isSubmitting}
                />
              </div>

              {error ? <p className="text-xs text-red-300">{error}</p> : null}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="btn-secondary focus-brand liquid-sheen rounded-xl px-3 py-2.5 text-sm font-semibold"
                data-sheen="event"
              >
                Отмена
              </button>
              <PrimaryButton
                type="button"
                onClick={() => {
                  void handleSubmit()
                }}
                disabled={isSubmitting}
                className="h-[42px] rounded-xl text-sm font-semibold"
                data-sheen={isSubmitting ? "off" : "always"}
              >
                {isSubmitting ? "Обработка..." : submitLabel}
              </PrimaryButton>
            </div>
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
