"use client"

import { ChevronRight, Star } from "lucide-react"

import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { GlassCard } from "@/components/ui/glass-card"

interface Achievement {
  id: number
  color: string
  unlocked: boolean
}

interface AchievementsProps {
  achievements: Achievement[]
  onViewAll?: () => void
}

export function Achievements({ achievements, onViewAll }: AchievementsProps) {
  const { t } = useI18n()

  return (
    <div className="mt-[var(--section-gap)] px-[var(--page-px)]">
      <GlassCard variant="elevated" className="rounded-[var(--radius-lg)] p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="type-heading text-foreground">{t("achievements.title")}</h2>
          <button
            onClick={onViewAll}
            type="button"
            className="focus-brand inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground"
          >
            {t("achievements.all")}
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-4 gap-3">
          {achievements.map((achievement) => (
            <div key={achievement.id} className="flex flex-col items-center gap-2">
              <div
                className={cn(
                  "relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-[20px] border transition-all duration-200",
                  achievement.unlocked
                    ? "border-brand-soft/18 bg-gradient-to-br from-brand-1/24 via-brand-1/14 to-brand-2/16 shadow-[var(--shadow-sm)]"
                    : "border-white/8 bg-surface-2/45",
                )}
              >
                {achievement.unlocked ? (
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-1/24 via-brand-1/12 to-brand-2/16 opacity-80" />
                ) : null}
                <Star
                  className={cn(
                    "relative z-10 h-6 w-6",
                    achievement.unlocked ? "text-foreground" : "text-text-tertiary",
                  )}
                  fill={achievement.unlocked ? "currentColor" : "none"}
                />
              </div>
              <span className="text-[11px] text-text-tertiary">#{achievement.id}</span>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  )
}
