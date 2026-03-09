"use client"

import React from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Copy, RefreshCw, X } from "lucide-react"

import { formatCurrencyAmount } from "@/lib/currency"
import { useI18n } from "@/lib/i18n"

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
  tonWalletAddress?: string | null
  tonWalletConnected?: boolean
  isWalletsLoading?: boolean
  isLedgerLoading?: boolean
  onRefreshWallets: () => void
  onRefreshLedger: () => void
  onClose: () => void
}

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

function formatDate(
  raw: string,
  formatter: (value: string | number | Date, options?: Intl.DateTimeFormatOptions) => string,
) {
  const ts = Date.parse(raw)
  if (!Number.isFinite(ts)) return raw
  return formatter(ts)
}

function formatWalletAmount(currency: WalletCurrency, raw: string) {
  return formatCurrencyAmount(currency, Number.parseFloat(raw), {
    compactStars: false,
    minimumFractionDigits: currency === "TON" ? 2 : 0,
    maximumFractionDigits: currency === "TON" ? 4 : 0,
  })
}

function shortenAddress(address: string) {
  if (address.length <= 18) return address
  return `${address.slice(0, 8)}...${address.slice(-8)}`
}

export function WalletOverviewModal({
  open,
  wallets,
  ledger,
  tonWalletAddress = null,
  tonWalletConnected = false,
  isWalletsLoading = false,
  isLedgerLoading = false,
  onRefreshWallets,
  onRefreshLedger,
  onClose,
}: WalletOverviewModalProps) {
  const shouldReduceMotion = useReducedMotion()
  const { t, formatDateTime } = useI18n()

  const handleCopyAddress = async () => {
    if (!tonWalletAddress || typeof navigator === "undefined" || !navigator.clipboard?.writeText) return
    try {
      await navigator.clipboard.writeText(tonWalletAddress)
    } catch {
      // ignore clipboard errors
    }
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[94] flex items-center justify-center p-3"
          onClick={onClose}
          style={{ background: "rgba(4,8,18,0.62)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" } as React.CSSProperties}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: shouldReduceMotion ? 0.1 : 0.2, ease: EASE }}
        >
          <motion.section
            className="max-h-[86vh] w-full max-w-lg overflow-y-auto rounded-[28px] border border-white/10 p-4 shadow-[0_24px_58px_rgba(2,6,18,0.28)]"
            onClick={(event) => event.stopPropagation()}
            style={{
              background:
                "radial-gradient(72% 52% at 50% 0%, rgba(107,75,255,0.12) 0%, transparent 68%), linear-gradient(160deg, rgba(28,38,64,0.92) 0%, rgba(16,24,42,0.94) 54%, rgba(10,15,30,0.96) 100%)",
            }}
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.985 }}
            transition={{ duration: shouldReduceMotion ? 0.1 : 0.22, ease: EASE }}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-foreground">{t("walletOverview.title")}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{t("walletOverview.subtitle")}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label={t("common.close")}
                className="focus-brand inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/16 bg-white/6 text-muted-foreground transition-colors duration-200 hover:text-foreground"
              >
                <X size={15} />
              </button>
            </div>

            <div className="space-y-3">
              <section className="rounded-[22px] border border-white/8 bg-white/[0.03] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                <div className="mb-3 rounded-[18px] border border-white/8 bg-background/45 px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-foreground">{t("walletOverview.tonConnect")}</span>
                    <span className={tonWalletConnected ? "text-emerald-300" : "text-muted-foreground"}>
                      {tonWalletConnected ? t("walletOverview.connected") : t("walletOverview.notConnected")}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <div className="min-w-0 break-all text-xs text-muted-foreground">
                      {tonWalletAddress ?? "--"}
                    </div>
                    {tonWalletAddress ? (
                      <button
                        type="button"
                        onClick={() => {
                          void handleCopyAddress()
                        }}
                        aria-label={t("common.copyLink")}
                        className="focus-brand inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/12 bg-white/6 text-muted-foreground transition-colors duration-200 hover:text-foreground"
                      >
                        <Copy size={14} />
                      </button>
                    ) : null}
                  </div>
                  {tonWalletAddress ? (
                    <div className="mt-2 text-[11px] text-muted-foreground/80">
                      {t("walletOverview.addressShort", { address: shortenAddress(tonWalletAddress) })}
                    </div>
                  ) : null}
                </div>

                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-foreground">{t("walletOverview.balances")}</h4>
                  <button
                    type="button"
                    onClick={onRefreshWallets}
                    disabled={isWalletsLoading}
                    className="btn-secondary focus-brand liquid-sheen inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold"
                    data-sheen="event"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isWalletsLoading ? "animate-spin" : ""}`} />
                    {isWalletsLoading ? t("common.refreshing") : t("common.refresh")}
                  </button>
                </div>

                <div className="space-y-2">
                  {wallets.length === 0 ? (
                    <p className="rounded-xl border border-white/10 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
                      {t("walletOverview.noWallets")}
                    </p>
                  ) : (
                    wallets.map((wallet) => (
                      <div key={wallet.id} className="rounded-[18px] border border-white/8 bg-background/45 px-3 py-2 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-foreground">{wallet.currency}</span>
                          <span className="font-medium text-foreground">
                            {formatWalletAmount(wallet.currency, wallet.balance)}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {t("walletOverview.locked", {
                            amount: formatWalletAmount(wallet.currency, wallet.lockedBalance),
                          })}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section className="rounded-[22px] border border-white/8 bg-white/[0.03] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-foreground">{t("walletOverview.recentOperations")}</h4>
                  <button
                    type="button"
                    onClick={onRefreshLedger}
                    disabled={isLedgerLoading}
                    className="btn-secondary focus-brand liquid-sheen inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold"
                    data-sheen="event"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isLedgerLoading ? "animate-spin" : ""}`} />
                    {isLedgerLoading ? t("common.refreshing") : t("common.refresh")}
                  </button>
                </div>

                <div className="space-y-2">
                  {ledger.length === 0 ? (
                    <p className="rounded-xl border border-white/10 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
                      {t("walletOverview.noOperations")}
                    </p>
                  ) : (
                    ledger.map((entry) => (
                      <div key={entry.id} className="rounded-[18px] border border-white/8 bg-background/45 px-3 py-2 text-xs">
                        <div className="flex items-center justify-between gap-2 text-foreground">
                          <span className="font-semibold">{entry.type}</span>
                          <span className="font-medium">
                            {entry.currency} {formatWalletAmount(entry.currency, entry.amount)}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-2 text-muted-foreground">
                          <span>{entry.status}</span>
                          <span>{formatDate(entry.createdAt, formatDateTime)}</span>
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
