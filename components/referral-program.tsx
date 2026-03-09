"use client"

import { useEffect, useId, useMemo, useRef, useState } from "react"
import { Copy, Info, Users } from "lucide-react"

import { useI18n } from "@/lib/i18n"
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
  if (fractionDigits <= 0) return String(Math.max(0, Math.floor(parsed)))
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
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  const [isInfoOpen, setInfoOpen] = useState(false)
  const [supportsHover, setSupportsHover] = useState(false)
  const infoId = useId()
  const infoRef = useRef<HTMLDivElement | null>(null)

  const tonReward = useMemo(() => formatDecimal(earnedTon, 2), [earnedTon])
  const starsReward = useMemo(() => formatDecimal(earnedStars, 0), [earnedStars])

  const shareText = useMemo(() => {
    const ratePercent = Math.round(Number.parseFloat(commissionRate || "0.10") * 100)
    const safePercent = Number.isFinite(ratePercent) ? ratePercent : 10
    return t("referral.shareText", { percent: safePercent })
  }, [commissionRate, t])

  const commissionPercent = useMemo(() => {
    const ratePercent = Math.round(Number.parseFloat(commissionRate || "0.10") * 100)
    return Number.isFinite(ratePercent) ? ratePercent : 10
  }, [commissionRate])

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return

    const mediaQuery = window.matchMedia("(hover: hover) and (pointer: fine)")
    const sync = () => {
      setSupportsHover(mediaQuery.matches)
      if (mediaQuery.matches) {
        setInfoOpen(false)
      }
    }

    sync()
    mediaQuery.addEventListener("change", sync)
    return () => mediaQuery.removeEventListener("change", sync)
  }, [])

  useEffect(() => {
    if (supportsHover || !isInfoOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!infoRef.current?.contains(event.target as Node)) {
        setInfoOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setInfoOpen(false)
      }
    }

    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [isInfoOpen, supportsHover])

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

  const handleInfoClick = () => {
    if (supportsHover) return
    setInfoOpen((prev) => !prev)
  }

  const showInfo = () => {
    if (!supportsHover) return
    setInfoOpen(true)
  }

  const hideInfo = () => {
    if (!supportsHover) return
    setInfoOpen(false)
  }

  return (
    <GlassCard variant="elevated" className="rounded-[var(--radius-xl)] p-4">
        <div className="mb-3 flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-1 to-brand-2 shadow-[var(--shadow-sm)]">
            <Users className="h-5 w-5 text-foreground" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-foreground">{t("referral.title")}</h3>
                <p className="text-sm text-muted-foreground">{t("referral.subtitle", { percent: commissionPercent })}</p>
              </div>

              <div
                ref={infoRef}
                className="relative ml-1 shrink-0"
                onMouseEnter={showInfo}
                onMouseLeave={hideInfo}
                onFocus={showInfo}
                onBlur={hideInfo}
              >
                <button
                  type="button"
                  onClick={handleInfoClick}
                  className="focus-brand relative inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/6 text-brand-soft shadow-[0_12px_22px_rgba(2,6,18,0.16)] backdrop-blur-xl transition-all duration-200 hover:border-white/18 hover:bg-white/10 hover:text-foreground"
                  aria-label={t("referral.infoAria")}
                  aria-expanded={isInfoOpen}
                  aria-controls={infoId}
                >
                  <span className="pointer-events-none absolute inset-[1px] rounded-full bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.34),rgba(255,255,255,0.09)_44%,rgba(255,255,255,0.02)_100%)]" />
                  <Info className="relative z-10 h-4 w-4" />
                </button>

                <div
                  id={infoId}
                  role="tooltip"
                  aria-hidden={!isInfoOpen}
                  className={[
                    "absolute right-0 top-full z-20 mt-2 w-[min(18rem,calc(100vw-4rem))] origin-top-right rounded-2xl border border-white/12 px-3.5 py-3 text-left shadow-[0_18px_36px_rgba(2,6,18,0.18)] backdrop-blur-2xl transition-all duration-250 ease-out",
                    "bg-[linear-gradient(145deg,rgba(255,255,255,0.16),rgba(255,255,255,0.06)_38%,rgba(168,85,247,0.12)_100%)]",
                    isInfoOpen ? "pointer-events-auto translate-y-0 scale-100 opacity-100" : "pointer-events-none translate-y-1 scale-[0.96] opacity-0",
                  ].join(" ")}
                >
                  <div className="pointer-events-none absolute inset-x-3 top-0 h-px bg-gradient-to-r from-white/0 via-white/45 to-white/0" />
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-soft/90">
                    {t("referral.infoTitle")}
                  </div>
                  <p className="text-sm leading-5 text-foreground/92">
                    {t("referral.infoText")}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t("referral.totalEarned")}</span>
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
            <span className="text-sm text-muted-foreground">{t("referral.invitedFriends")}</span>
            <span className="font-semibold text-foreground">{invitedCount}</span>
          </div>
        </div>

        <div className="flex gap-2">
          <PrimaryButton type="button" onClick={handleInvite} data-sheen="event" className="h-12 flex-1 rounded-[18px]">
            {t("referral.invite")}
          </PrimaryButton>

          <button
            type="button"
            onClick={handleCopy}
            className="btn-secondary focus-brand inline-flex h-12 w-12 items-center justify-center rounded-xl"
            aria-label={t("referral.copy")}
          >
            <Copy className={copied ? "h-5 w-5 text-brand-soft" : "h-5 w-5 text-muted-foreground"} />
          </button>
        </div>
    </GlassCard>
  )
}
