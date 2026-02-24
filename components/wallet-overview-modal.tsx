"use client"

import React from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { RefreshCw, X } from "lucide-react"

type WalletCurrency = "TON" | "STARS"

interface WalletItem {
  id: string
  currency: WalletCurrency
  balance: string
  lockedBalance: string
}

interface LedgerItem {
  id: string
  currency: WalletCurrency
  amount: string
  type: string
  status: string
  createdAt: string
}

interface WalletOverviewModalProps {
  open: boolean
  wallets: WalletItem[]
  ledger: LedgerItem[]
  isWalletsLoading?: boolean
  isLedgerLoading?: boolean
  onRefreshWallets: () => void
  onRefreshLedger: () => void
  onClose: () => void
}

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

function formatAmount(raw: string) {
  const parsed = Number.parseFloat(raw)
  if (!Number.isFinite(parsed)) return raw
  return parsed.toFixed(4)
}

function formatDate(raw: string) {
  const ts = Date.parse(raw)
  if (!Number.isFinite(ts)) return raw
  return new Date(ts).toLocaleString("ru-RU")
}

export function WalletOverviewModal({
  open,
  wallets,
  ledger,
  isWalletsLoading = false,
  isLedgerLoading = false,
  onRefreshWallets,
  onRefreshLedger,
  onClose,
}: WalletOverviewModalProps) {
  const shouldReduceMotion = useReducedMotion()

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[94] flex items-center justify-center p-3"
          onClick={onClose}
          style={{ background: "rgba(6,9,22,0.74)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" } as React.CSSProperties}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: shouldReduceMotion ? 0.1 : 0.2, ease: EASE }}
        >
          <motion.section
            className="w-full max-w-lg max-h-[86vh] overflow-y-auto rounded-[22px] border border-white/12 p-4 shadow-[0_24px_58px_rgba(4,8,22,0.52)]"
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
                <h3 className="text-lg font-semibold text-foreground">Кошелек</h3>
                <p className="mt-1 text-xs text-muted-foreground">Актуальные балансы и последние операции</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Закрыть"
                className="focus-brand inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/16 bg-white/6 text-muted-foreground transition-colors duration-200 hover:text-foreground"
              >
                <X size={15} />
              </button>
            </div>

            <div className="space-y-3">
              <section className="rounded-2xl border border-white/12 bg-white/[0.03] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-foreground">Балансы</h4>
                  <button
                    type="button"
                    onClick={onRefreshWallets}
                    disabled={isWalletsLoading}
                    className="btn-secondary focus-brand liquid-sheen inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold"
                    data-sheen="event"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isWalletsLoading ? "animate-spin" : ""}`} />
                    {isWalletsLoading ? "Обновление" : "Обновить"}
                  </button>
                </div>

                <div className="space-y-2">
                  {wallets.length === 0 ? (
                    <p className="rounded-xl border border-white/10 bg-background/40 px-3 py-2 text-xs text-muted-foreground">Кошельки не найдены</p>
                  ) : (
                    wallets.map((wallet) => (
                      <div
                        key={wallet.id}
                        className="rounded-xl border border-white/12 bg-background/55 px-3 py-2 text-sm"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-foreground">{wallet.currency}</span>
                          <span className="font-medium text-foreground">{formatAmount(wallet.balance)}</span>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Locked: {formatAmount(wallet.lockedBalance)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section className="rounded-2xl border border-white/12 bg-white/[0.03] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-foreground">Последние операции</h4>
                  <button
                    type="button"
                    onClick={onRefreshLedger}
                    disabled={isLedgerLoading}
                    className="btn-secondary focus-brand liquid-sheen inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold"
                    data-sheen="event"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isLedgerLoading ? "animate-spin" : ""}`} />
                    {isLedgerLoading ? "Обновление" : "Обновить"}
                  </button>
                </div>

                <div className="space-y-2">
                  {ledger.length === 0 ? (
                    <p className="rounded-xl border border-white/10 bg-background/40 px-3 py-2 text-xs text-muted-foreground">Операций пока нет</p>
                  ) : (
                    ledger.map((entry) => (
                      <div key={entry.id} className="rounded-xl border border-white/12 bg-background/55 px-3 py-2 text-xs">
                        <div className="flex items-center justify-between gap-2 text-foreground">
                          <span className="font-semibold">{entry.type}</span>
                          <span className="font-medium">{entry.currency} {formatAmount(entry.amount)}</span>
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-2 text-muted-foreground">
                          <span>{entry.status}</span>
                          <span>{formatDate(entry.createdAt)}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
