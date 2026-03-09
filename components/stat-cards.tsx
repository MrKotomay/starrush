"use client"

import { Trophy, Users } from "lucide-react"

import { formatCurrencyAmount } from "@/lib/currency"
import { useI18n } from "@/lib/i18n"
import { StatCard } from "@/components/ui/stat-card"
import { StatIcon } from "@/components/ui/stat-icon"

interface StatCardsProps {
  starsBalance: number
  tonBalance: number
  referrals: number
  rewards: number
}

export function StatCards({
  starsBalance,
  tonBalance,
  referrals,
  rewards,
}: StatCardsProps) {
  const { t } = useI18n()

  return (
    <div className="grid grid-cols-2 gap-[var(--card-gap)] px-[var(--page-px)]">
      <StatCard
        iconVariant="plain"
        icon={
          <StatIcon tone="gold">
            <img src="/stars.svg" alt="Stars" className="h-5 w-5 object-contain" />
          </StatIcon>
        }
        label={t("stat.stars")}
        value={formatCurrencyAmount("STARS", starsBalance, { compactStars: false })}
      />
      <StatCard
        iconVariant="plain"
        icon={
          <StatIcon tone="blue">
            <img src="/ton.svg" alt="TON" className="h-6 w-6 rounded-full object-contain" />
          </StatIcon>
        }
        label={t("common.ton")}
        value={tonBalance.toFixed(2)}
      />
      <StatCard
        iconVariant="plain"
        icon={
          <StatIcon tone="mint">
            <Users className="h-6 w-6" />
          </StatIcon>
        }
        label={t("stat.referrals")}
        value={referrals}
      />
      <StatCard
        iconVariant="plain"
        icon={
          <StatIcon tone="violet">
            <Trophy className="h-6 w-6" />
          </StatIcon>
        }
        label={t("stat.rewards")}
        value={rewards}
      />
    </div>
  )
}

