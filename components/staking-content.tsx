"use client"

import Image from "next/image"
import { motion, useReducedMotion } from "framer-motion"
import { Trophy, Vault } from "lucide-react"

import { cn } from "@/lib/utils"
import { GlassCard } from "@/components/ui/glass-card"
import { PrimaryButton } from "@/components/ui/primary-button"
import { StatCard } from "@/components/ui/stat-card"

import styles from "@/styles/staking-safe.module.css"

const leaderboard = [
  { rank: 1, username: "ldxbl", avatar: "/avatars/1.jpg", gifts: 1303, commission: "19.80%" },
  { rank: 2, username: "sekret7483...", avatar: null, gifts: 620, commission: "9.42%" },
  { rank: 3, username: "Mickey_0_N...", avatar: "/avatars/3.jpg", gifts: 333, commission: "5.06%" },
  { rank: 4, username: "legality", avatar: "/avatars/4.jpg", gifts: 302, commission: "4.59%" },
  { rank: 5, username: "ImPaulDuRo...", avatar: null, gifts: 260, commission: "3.95%" },
  { rank: 6, username: "brocry", avatar: "/avatars/6.jpg", gifts: 234, commission: "3.55%" },
  { rank: 7, username: "L_locket", avatar: "/avatars/7.jpg", gifts: 230, commission: "3.54%" },
]

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

type StakingContentProps = {
  stakeAmountTon?: number
}

function formatTonAmount(value: number) {
  if (!Number.isFinite(value)) return "0.00"
  return Math.max(0, value).toFixed(2)
}

function rankColor(rank: number) {
  if (rank === 1) return "text-star"
  if (rank === 2) return "text-text-secondary"
  if (rank === 3) return "text-warning"
  return "text-text-tertiary"
}

export function StakingContent({ stakeAmountTon = 0 }: StakingContentProps) {
  const stakingAmountLabel = formatTonAmount(stakeAmountTon)
  const shouldReduceMotion = useReducedMotion()
  const sectionInitial = shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }
  const sectionAnimate = { opacity: 1, y: 0 }

  return (
    <div className="px-4 pb-2">
      <motion.div
        initial={sectionInitial}
        animate={sectionAnimate}
        transition={{ duration: shouldReduceMotion ? 0.1 : 0.2, ease: EASE }}
      >
        <GlassCard variant="hero" className={cn("mb-4 p-4 pb-3", styles.vaultCard)}>
          <div className={styles.safeHero} aria-hidden="true">
            <div className={styles.backGlow} />
            <div className={styles.leftGlow} />
            <div className={styles.rightGlow} />
            <div className={styles.safeFloat}>
              <Image
                src="/safe.png"
                alt=""
                fill
                className={styles.safeImage}
                sizes="(max-width: 640px) 80vw, 360px"
                priority={false}
              />
            </div>
          </div>

          <div className={styles.vaultContent}>
            <div className="relative z-20 flex items-center justify-between rounded-2xl border border-border/80 bg-surface-2/88 p-3 shadow-[var(--shadow-sm)]">
              <div>
                <p className="mb-1 text-sm text-muted-foreground">Ты заработал:</p>
                <div className="flex items-center gap-2">
                  <img src="/ton.svg" alt="TON" className="h-5 w-5 rounded-full" />
                  <span className="text-base font-semibold text-foreground">{stakingAmountLabel} TON</span>
                </div>
              </div>
              <PrimaryButton breathing className="h-10 min-w-28 rounded-xl px-5 text-sm">
                Забрать
              </PrimaryButton>
            </div>
          </div>
        </GlassCard>
      </motion.div>

      <motion.div
        className="mb-6 grid grid-cols-2 gap-3"
        initial={sectionInitial}
        animate={sectionAnimate}
        transition={{ duration: shouldReduceMotion ? 0.1 : 0.2, ease: EASE, delay: shouldReduceMotion ? 0 : 0.03 }}
      >
        <StatCard
          icon={<Vault className="h-5 w-5 text-foreground" />}
          iconClassName="bg-gradient-to-br from-brand-1 to-brand-2"
          label="Твой стейкинг"
          value={`${stakingAmountLabel} TON`}
        />
        <StatCard
          icon={<Trophy className="h-5 w-5 text-foreground" />}
          iconClassName="bg-gradient-to-br from-brand-2 to-brand-1"
          label="Твое место"
          value="3034 место"
        />
      </motion.div>

      <motion.div
        className="mb-6"
        initial={sectionInitial}
        animate={sectionAnimate}
        transition={{ duration: shouldReduceMotion ? 0.1 : 0.2, ease: EASE, delay: shouldReduceMotion ? 0 : 0.06 }}
      >
        <div className="mb-4 text-center">
          <h2 className="mb-2 text-2xl font-bold text-foreground">Лидерборд</h2>
          <p className="mb-1 text-sm text-muted-foreground">
            Список игроков с самым большим
            <br />
            игровым инвентарем
          </p>
          <p className="text-xs text-text-tertiary">
            50% прибыли распределяется среди топ 50 человек
            <br />
            Чем больше подарков, тем больше % прибыли
          </p>
        </div>

        <GlassCard variant="elevated" className="rounded-[20px] p-2.5">
          <div className="mb-2 grid grid-cols-[48px_1fr_74px_72px] items-center px-2.5 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
            <span>Место</span>
            <span>Игрок</span>
            <span className="text-right">Подарки</span>
            <span className="text-right">Комиссия</span>
          </div>

          <div className="space-y-1.5">
            {leaderboard.map((item, index) => {
              const isTop1 = item.rank === 1
              const isTop3 = item.rank <= 3

              return (
                <motion.div
                  key={item.rank}
                  initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: shouldReduceMotion ? 0.1 : 0.2,
                    delay: shouldReduceMotion ? 0 : 0.09 + index * 0.03,
                    ease: EASE,
                  }}
                  className={cn(
                    "grid grid-cols-[48px_1fr_74px_72px] items-center gap-2 rounded-2xl border px-2.5 py-2.5 transition-colors duration-200",
                    isTop1
                      ? "border-brand-soft/38 bg-gradient-to-r from-brand-1/30 to-brand-2/16 shadow-[var(--shadow-sm)]"
                      : isTop3
                        ? "border-brand-soft/20 bg-gradient-to-r from-brand-1/20 to-surface-2/80"
                        : "border-transparent bg-surface-2/58",
                  )}
                >
                  <div className="flex items-center justify-center gap-2">
                    <span className={cn("text-lg font-extrabold tabular-nums", rankColor(item.rank))}>
                      {item.rank}
                    </span>
                  </div>

                  <div className="flex min-w-0 items-center gap-2.5">
                    <div
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-xs font-bold text-foreground",
                        isTop3
                          ? "border-brand-soft/42 bg-gradient-to-br from-brand-1 to-brand-2"
                          : "border-border/80 bg-gradient-to-br from-brand-1/45 to-brand-2/28",
                      )}
                    >
                      {item.username.charAt(0).toUpperCase()}
                    </div>
                    <span className="truncate text-sm font-medium text-foreground">{item.username}</span>
                  </div>

                  <div className="text-right text-sm font-semibold tabular-nums text-foreground">
                    {item.gifts}
                  </div>
                  <div className="text-right text-sm font-semibold tabular-nums text-brand-soft">
                    {item.commission}
                  </div>
                </motion.div>
              )
            })}
          </div>
        </GlassCard>
      </motion.div>
    </div>
  )
}

