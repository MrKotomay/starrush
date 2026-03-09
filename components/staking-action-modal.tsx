"use client"

import React, { useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ArrowDownToLine, ArrowUpFromLine, X } from "lucide-react"

import { PrimaryButton } from "@/components/ui/primary-button"
import { formatCurrencyAmount } from "@/lib/currency"
import { useI18n } from "@/lib/i18n"

type StakingActionMode = "stake" | "unstake"

type StakingAssetModalView = {
  assetId: "TON" | "STARS"
  symbol: string
  icon: string
  walletBalance: string
  stakedPrincipal: string
  minStake: string
}

type StakingActionModalProps = {
  open: boolean
  mode: StakingActionMode | null
  asset: StakingAssetModalView | null
  isSubmitting?: boolean
  onClose: () => void
  onSubmit: (input: { amount: number }) => Promise<void>
}

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

const PRESETS: Record<StakingAssetModalView["assetId"], string[]> = {
  TON: ["0.5", "1", "2", "5"],
  STARS: ["50", "100", "250", "500"],
}

export function StakingActionModal({
  open,
  mode,
  asset,
  isSubmitting = false,
  onClose,
  onSubmit,
}: StakingActionModalProps) {
  const { t } = useI18n()
  const shouldReduceMotion = useReducedMotion()
  const [amountInput, setAmountInput] = useState("")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !asset || !mode) return
    setAmountInput(asset.assetId === "TON" ? asset.minStake : "1")
    setError(null)
  }, [asset, mode, open])

  const title = useMemo(() => {
    if (mode === "stake") return t("staking.modal.stakeTitle")
    if (mode === "unstake") return t("staking.modal.unstakeTitle")
    return ""
  }, [mode, t])

  const subtitle = useMemo(() => {
    if (mode === "stake") return t("staking.modal.subtitleStake")
    if (mode === "unstake") return t("staking.modal.subtitleUnstake")
    return ""
  }, [mode, t])

  if (!mode || !asset) return null

  const parsedWallet = Number.parseFloat(asset.walletBalance)
  const parsedStaked = Number.parseFloat(asset.stakedPrincipal)
  const parsedMinStake = Number.parseFloat(asset.minStake)
  const presets = PRESETS[asset.assetId]

  const handleSubmit = async () => {
    const amount = Number.parseFloat(amountInput)
    if (!Number.isFinite(amount) || amount <= 0) {
      setError(t("staking.error.invalidAmount"))
      return
    }
    if (asset.assetId === "STARS" && !Number.isInteger(amount)) {
      setError(t("staking.error.integerRequired"))
      return
    }
    setError(null)
    await onSubmit({ amount })
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[95] flex items-center justify-center p-4"
          onClick={onClose}
          style={{ background: "rgba(4,8,18,0.62)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" } as React.CSSProperties}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: shouldReduceMotion ? 0.1 : 0.2, ease: EASE }}
        >
          <motion.section
            className="w-full max-w-sm rounded-[28px] border border-white/10 p-4 shadow-[0_24px_58px_rgba(2,6,18,0.28)]"
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
              <div className="min-w-0">
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-2xl border border-white/10 bg-white/6">
                    {mode === "stake" ? <ArrowUpFromLine size={16} /> : <ArrowDownToLine size={16} />}
                  </span>
                  <img src={asset.icon} alt={asset.symbol} className="h-6 w-6 rounded-full" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">{title}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                aria-label={t("common.close")}
                className="focus-brand inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/16 bg-white/6 text-muted-foreground transition-colors duration-200 hover:text-foreground"
              >
                <X size={15} />
              </button>
            </div>

            <div className="space-y-3">
              <div className="rounded-[20px] border border-white/10 bg-background/45 p-3 text-xs text-muted-foreground">
                <div>{t("staking.modal.available", { amount: formatCurrencyAmount(asset.assetId, parsedWallet, { compactStars: false }), asset: asset.symbol })}</div>
                <div className="mt-1">{t("staking.modal.staked", { amount: formatCurrencyAmount(asset.assetId, parsedStaked, { compactStars: false }), asset: asset.symbol })}</div>
                <div className="mt-1">{t("staking.modal.minStake", { amount: formatCurrencyAmount(asset.assetId, parsedMinStake, { compactStars: false }), asset: asset.symbol })}</div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">{t("common.amount")}</label>
                <input
                  type="number"
                  min={0}
                  step={asset.assetId === "TON" ? "0.01" : "1"}
                  inputMode={asset.assetId === "TON" ? "decimal" : "numeric"}
                  value={amountInput}
                  onChange={(event) => setAmountInput(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-white/14 bg-background/70 px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-brand-soft/60"
                  placeholder={asset.assetId === "TON" ? "0.10" : "1"}
                  disabled={isSubmitting}
                />
              </div>

              <div className="grid grid-cols-4 gap-2">
                {presets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => setAmountInput(preset)}
                    className="rounded-xl border border-white/10 bg-white/6 px-2 py-2 text-xs font-semibold text-foreground transition-colors duration-200 hover:border-white/20 hover:bg-white/10"
                  >
                    {preset}
                  </button>
                ))}
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
                {t("common.cancel")}
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
                {isSubmitting ? t("common.processing") : title}
              </PrimaryButton>
            </div>
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
