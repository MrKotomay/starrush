"use client"

import { PrimaryButton } from "@/components/ui/primary-button"
import { GlassCard } from "@/components/ui/glass-card"
import { useI18n } from "@/lib/i18n"

interface ActionButtonsProps {
  onDeposit: () => void
  onWithdraw: () => void
  isDepositLoading?: boolean
  isWithdrawLoading?: boolean
}

export function ActionButtons({
  onDeposit,
  onWithdraw,
  isDepositLoading = false,
  isWithdrawLoading = false,
}: ActionButtonsProps) {
  const { t } = useI18n()
  const isBusy = isDepositLoading || isWithdrawLoading

  return (
    <div className="mt-4 px-[var(--page-px)]">
      <GlassCard variant="default" className="grid grid-cols-2 gap-3 rounded-[24px] p-2">
        <PrimaryButton
          type="button"
          onClick={onDeposit}
          disabled={isBusy}
          aria-busy={isDepositLoading}
          loading={isDepositLoading}
          depth="raised"
          variant="brand"
          data-sheen="event"
          className="btn-deposit-gradient h-12 rounded-[18px] text-base font-semibold"
        >
          {isDepositLoading ? t("action.depositLoading") : t("action.deposit")}
        </PrimaryButton>

        <PrimaryButton
          type="button"
          onClick={onWithdraw}
          disabled={isBusy}
          aria-busy={isWithdrawLoading}
          loading={isWithdrawLoading}
          depth="flat"
          variant="glass"
          className="h-12 rounded-[18px] text-base font-semibold"
        >
          {isWithdrawLoading ? t("action.withdrawLoading") : t("action.withdraw")}
        </PrimaryButton>
      </GlassCard>
    </div>
  )
}
