"use client"

import { useMemo, useState } from "react"
import { Copy, Users } from "lucide-react"

import { GlassCard } from "@/components/ui/glass-card"
import { PrimaryButton } from "@/components/ui/primary-button"

type ReferralProgramProps = {
  invitedCount: number
  earnedTon: string
  earnedStars: string
  referralLink: string
  commissionRate?: string
}

type TelegramWebApp = {
  openTelegramLink?: (url: string) => void
  openLink?: (url: string) => void
}

function formatDecimal(value: string, fractionDigits = 2) {
  const parsed = Number.parseFloat(value)
  if (!Number.isFinite(parsed)) return "0"
  return parsed.toFixed(fractionDigits).replace(/\.?0+$/, "")
}

function getTelegramWebApp(): TelegramWebApp | undefined {
  if (typeof window === "undefined") return undefined
  const win = window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }
  return win.Telegram?.WebApp
}

export function ReferralProgram({
  invitedCount,
  earnedTon,
  earnedStars,
  referralLink,
  commissionRate = "0.10",
}: ReferralProgramProps) {
  const [copied, setCopied] = useState(false)

  const tonReward = useMemo(() => formatDecimal(earnedTon, 2), [earnedTon])
  const starsReward = useMemo(() => formatDecimal(earnedStars, 2), [earnedStars])

  const shareText = useMemo(() => {
    const ratePercent = Math.round(Number.parseFloat(commissionRate || "0.10") * 100)
    const safePercent = Number.isFinite(ratePercent) ? ratePercent : 10
    return `Присоединяйся к StarRush. Бонус за депозит друзей: ${safePercent}%.`
  }, [commissionRate])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(referralLink)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch {
      setCopied(false)
    }
  }

  const handleInvite = () => {
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(shareText)}`
    const tg = getTelegramWebApp()

    if (tg?.openTelegramLink) {
      tg.openTelegramLink(shareUrl)
      return
    }
    if (tg?.openLink) {
      tg.openLink(shareUrl)
      return
    }

    window.open(shareUrl, "_blank", "noopener,noreferrer")
  }

  return (
    <div className="relative rounded-[20px] p-[1px]" style={{ backgroundImage: "var(--primary-gradient)" }}>
      <GlassCard variant="elevated" className="rounded-[19px] p-4">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-1 to-brand-2 shadow-[var(--shadow-sm)]">
            <Users className="h-5 w-5 text-foreground" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">Реферальная программа</h3>
            <p className="text-sm text-muted-foreground">Зарабатывайте 10% от депозитов друзей</p>
          </div>
        </div>

        <div className="mb-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Заработано всего</span>
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
              <span className="inline-flex items-center gap-1">
                <img src="/ton.svg" alt="TON" className="h-4 w-4 rounded-full object-contain" />
                <span className="tabular-nums text-foreground">{tonReward}</span>
              </span>
              <span className="text-text-tertiary">+</span>
              <span className="inline-flex items-center gap-1">
                <img src="/stars.svg" alt="Stars" className="h-4 w-4 object-contain" />
                <span className="tabular-nums text-foreground">{starsReward}</span>
              </span>
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Приглашено друзей</span>
            <span className="font-semibold text-foreground">{invitedCount}</span>
          </div>
        </div>

        <div className="flex gap-2">
          <PrimaryButton
            type="button"
            onClick={handleInvite}
            breathing
            className="h-12 flex-1 rounded-xl"
          >
            Пригласить
          </PrimaryButton>
          <button
            type="button"
            onClick={handleCopy}
            className="btn-secondary focus-brand inline-flex h-12 w-12 items-center justify-center rounded-xl"
            aria-label="Скопировать ссылку"
          >
            <Copy className={copied ? "h-5 w-5 text-brand-soft" : "h-5 w-5 text-muted-foreground"} />
          </button>
        </div>
      </GlassCard>
    </div>
  )
}

