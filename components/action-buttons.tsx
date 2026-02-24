"use client"

import { PrimaryButton } from "@/components/ui/primary-button"

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
  const isBusy = isDepositLoading || isWithdrawLoading

  return (
    <div className="mt-4 grid grid-cols-2 gap-[var(--card-gap)] px-[var(--page-px)]">
      <PrimaryButton
        type="button"
        onClick={onDeposit}
        disabled={isBusy}
        aria-busy={isDepositLoading}
        loading={isDepositLoading}
        breathing
        depth="raised"
        variant="brand"
        className="btn-deposit-gradient h-12 rounded-[var(--radius-md)] text-base font-semibold"
      >
        {isDepositLoading ? "Пополнение..." : "Пополнить"}
      </PrimaryButton>

      <PrimaryButton
        type="button"
        onClick={onWithdraw}
        disabled={isBusy}
        aria-busy={isWithdrawLoading}
        loading={isWithdrawLoading}
        breathing
        depth="raised"
        variant="brandSoft"
        className="btn-withdraw-gradient h-12 rounded-[var(--radius-md)] text-base font-semibold"
      >
        {isWithdrawLoading ? "Вывод..." : "Вывод"}
      </PrimaryButton>
    </div>
  )
}
