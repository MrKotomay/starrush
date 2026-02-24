"use client"

import React from "react"

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

function formatAmount(raw: string) {
  const parsed = Number.parseFloat(raw)
  if (!Number.isFinite(parsed)) return raw
  return parsed.toFixed(4)
}

function formatDate(raw: string) {
  const ts = Date.parse(raw)
  if (!Number.isFinite(ts)) return raw
  return new Date(ts).toLocaleString()
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
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
      style={{ background: "rgba(6,9,22,0.72)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" } as React.CSSProperties}
    >
      <div
        className="w-full max-w-lg rounded-[18px] p-5 max-h-[85vh] overflow-y-auto"
        onClick={(event) => event.stopPropagation()}
        style={{
          background: "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%), var(--ui-surface-1, #141A3A)",
          border: "1px solid rgba(255,255,255,0.10)",
          boxShadow: "0 18px 48px rgba(4,7,22,0.54), 0 6px 18px rgba(11,17,38,0.30)",
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Кошелек</h3>
            <p className="text-xs text-muted-foreground mt-1">Актуальные балансы и последние операции.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground"
          >
            Закрыть
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-border p-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-foreground">Балансы</h4>
            <button
              type="button"
              onClick={onRefreshWallets}
              disabled={isWalletsLoading}
              className="text-xs text-primary disabled:opacity-60"
            >
              {isWalletsLoading ? "Обновление..." : "Обновить"}
            </button>
          </div>

          <div className="mt-2 space-y-2">
            {wallets.length === 0 ? (
              <p className="text-xs text-muted-foreground">Кошельки не найдены.</p>
            ) : (
              wallets.map((wallet) => (
                <div
                  key={wallet.id}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm flex items-center justify-between"
                >
                  <span className="font-medium">{wallet.currency}</span>
                  <span>
                    {formatAmount(wallet.balance)} (locked: {formatAmount(wallet.lockedBalance)})
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-border p-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-foreground">Последние операции</h4>
            <button
              type="button"
              onClick={onRefreshLedger}
              disabled={isLedgerLoading}
              className="text-xs text-primary disabled:opacity-60"
            >
              {isLedgerLoading ? "Обновление..." : "Обновить"}
            </button>
          </div>

          <div className="mt-2 space-y-2">
            {ledger.length === 0 ? (
              <p className="text-xs text-muted-foreground">Операций пока нет.</p>
            ) : (
              ledger.map((entry) => (
                <div key={entry.id} className="rounded-lg border border-border bg-background px-3 py-2 text-xs">
                  <div className="flex items-center justify-between text-foreground">
                    <span>{entry.type}</span>
                    <span>{entry.currency} {formatAmount(entry.amount)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-muted-foreground">
                    <span>{entry.status}</span>
                    <span>{formatDate(entry.createdAt)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
