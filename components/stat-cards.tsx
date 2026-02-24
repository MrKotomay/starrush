"use client"

import { Trophy, Users } from "lucide-react"

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
  return (
    <div className="grid grid-cols-2 gap-3 px-4">
      <StatCard
        iconVariant="plain"
        icon={
          <StatIcon tone="gold">
            <img src="/stars.svg" alt="Stars" className="h-5 w-5 object-contain" />
          </StatIcon>
        }
        label="Звезды"
        value={starsBalance.toFixed(2)}
      />
      <StatCard
        iconVariant="plain"
        icon={
          <StatIcon tone="blue">
            <img src="/ton.svg" alt="TON" className="h-6 w-6 rounded-full object-contain" />
          </StatIcon>
        }
        label="TON"
        value={tonBalance.toFixed(2)}
      />
      <StatCard
        iconVariant="plain"
        icon={
          <StatIcon tone="mint">
            <Users className="h-6 w-6" />
          </StatIcon>
        }
        label="Рефералы"
        value={referrals}
      />
      <StatCard
        iconVariant="plain"
        icon={
          <StatIcon tone="violet">
            <Trophy className="h-6 w-6" />
          </StatIcon>
        }
        label="Награды"
        value={rewards}
      />
    </div>
  )
}

