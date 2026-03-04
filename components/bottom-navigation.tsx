"use client"

import { useEffect, useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { Rocket, TrendingUp, User } from "lucide-react"

import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { BottomNavShell } from "@/components/ui/bottom-nav-shell"

type TabId = "staking" | "mine" | "profile"

interface BottomNavigationProps {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
}

export function BottomNavigation({ activeTab, onTabChange }: BottomNavigationProps) {
  const { t } = useI18n()
  const shouldReduceMotion = useReducedMotion()
  const [rushLaunchTick, setRushLaunchTick] = useState(0)
  const tabs = [
    { id: "staking" as TabId, label: t("bottomNav.staking"), icon: TrendingUp },
    { id: "mine" as TabId, label: t("bottomNav.rush"), icon: Rocket },
    { id: "profile" as TabId, label: t("bottomNav.profile"), icon: User },
  ]

  useEffect(() => {
    const root = document.documentElement
    const prev = root.style.getPropertyValue("--bottom-nav-h")
    root.style.setProperty("--bottom-nav-h", "66px")
    return () => {
      if (prev) root.style.setProperty("--bottom-nav-h", prev)
      else root.style.removeProperty("--bottom-nav-h")
    }
  }, [])

  const indicatorTransition = shouldReduceMotion
    ? ({ duration: 0.1 } as const)
    : ({ type: "spring", stiffness: 500, damping: 36, mass: 0.7 } as const)

  const handleTabClick = (tab: TabId) => {
    if (tab === "mine" && !shouldReduceMotion) {
      setRushLaunchTick((prev) => prev + 1)
    }
    onTabChange(tab)
  }

  return (
    <nav
      data-ui="bottom-nav"
      className="fixed left-1/2 z-50 -translate-x-1/2 px-0.5 transition-opacity duration-200"
      style={{ bottom: "calc(12px + var(--content-safe-bottom))" }}
    >
      <BottomNavShell className="relative px-1 py-1">
        <div className="flex items-center gap-0.5">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id
            const Icon = tab.icon

            return (
              <button
                key={tab.id}
                onClick={() => handleTabClick(tab.id)}
                className={cn(
                  "focus-brand relative flex min-w-[95px] flex-col items-center gap-0.5 rounded-[var(--radius-lg)] px-4 py-1.5 transition-colors duration-200 ease-out",
                  isActive ? "text-foreground" : "text-text-tertiary",
                )}
                aria-current={isActive ? "page" : undefined}
                type="button"
              >
                {isActive ? (
                  <motion.span
                    layoutId="bottom-nav-active-pill"
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 rounded-[var(--radius-lg)] border border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.08)_0%,rgba(255,255,255,0.03)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]"
                    transition={indicatorTransition}
                  />
                ) : null}

                <span className="relative z-10">
                  <span
                    className={cn(
                      "relative inline-flex rounded-full p-1.5 transition-all duration-200 ease-out",
                    )}
                  >
                    {isActive ? (
                      <motion.span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-br from-brand-1 to-brand-2 shadow-[0_6px_18px_rgba(101,29,203,0.44)]"
                        initial={{ scale: 0.82, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                      />
                    ) : null}
                    {tab.id === "mine" ? (
                      <motion.span
                        key={`rush-rocket-${rushLaunchTick}-${isActive ? "active" : "idle"}`}
                        initial={false}
                        animate={
                          shouldReduceMotion
                            ? { x: 0, y: 0, rotate: 0, scale: 1 }
                            : isActive
                              ? {
                                  x: [0, 1, 0, 4, 0],
                                  y: [0, -2, -5, -9, 0],
                                  rotate: [0, -10, -18, -10, 0],
                                  scale: [1, 1.04, 1.08, 1.12, 1],
                                }
                              : { x: 0, y: 0, rotate: 0, scale: 1 }
                        }
                        transition={
                          shouldReduceMotion
                            ? { duration: 0.1 }
                            : isActive
                              ? {
                                  duration: 0.72,
                                  ease: [0.22, 1, 0.36, 1],
                                  times: [0, 0.18, 0.42, 0.72, 1],
                                }
                              : { duration: 0.18 }
                        }
                        className="relative z-10 inline-flex"
                      >
                        <motion.span
                          aria-hidden="true"
                          initial={false}
                          animate={
                            shouldReduceMotion
                              ? { opacity: 0, scaleY: 1, y: 0 }
                              : isActive
                                ? {
                                    opacity: [0, 0.92, 0.68, 0],
                                    scaleY: [0.5, 1.3, 0.9, 0.45],
                                    scaleX: [0.7, 1.05, 0.86, 0.62],
                                    y: [4, 7, 10, 12],
                                  }
                                : { opacity: 0, scaleY: 0.7, scaleX: 0.7, y: 5 }
                          }
                          transition={
                            shouldReduceMotion
                              ? { duration: 0.1 }
                              : {
                                  duration: 0.52,
                                  ease: "easeOut",
                                  times: [0, 0.2, 0.6, 1],
                                }
                          }
                          className="pointer-events-none absolute left-1/2 top-full h-3.5 w-2 -translate-x-1/2 rounded-full bg-[linear-gradient(180deg,rgba(255,245,157,0.95)_0%,rgba(255,163,26,0.95)_52%,rgba(255,92,34,0.18)_100%)] blur-[0.5px]"
                          style={{ transformOrigin: "center top" }}
                        />

                        <motion.span
                          aria-hidden="true"
                          initial={false}
                          animate={
                            shouldReduceMotion
                              ? { opacity: 0, scale: 0.8, y: 0 }
                              : isActive
                                ? {
                                    opacity: [0, 0.8, 0.35, 0],
                                    scale: [0.65, 1.18, 0.92, 0.7],
                                    y: [3, 6, 9, 11],
                                  }
                                : { opacity: 0, scale: 0.7, y: 4 }
                          }
                          transition={
                            shouldReduceMotion
                              ? { duration: 0.1 }
                              : {
                                  duration: 0.56,
                                  ease: "easeOut",
                                  times: [0, 0.24, 0.7, 1],
                                }
                          }
                          className="pointer-events-none absolute left-1/2 top-full h-[18px] w-[18px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,184,77,0.45)_0%,rgba(255,118,36,0.22)_48%,rgba(255,118,36,0)_75%)]"
                        />

                        <Icon
                          className={cn(
                            "relative z-10 h-3.5 w-3.5 transition-colors duration-200",
                            isActive ? "text-foreground" : "text-text-tertiary",
                          )}
                        />
                      </motion.span>
                    ) : (
                      <Icon
                        className={cn(
                          "relative z-10 h-3.5 w-3.5 transition-colors duration-200",
                          isActive ? "text-foreground" : "text-text-tertiary",
                        )}
                      />
                    )}
                  </span>
                </span>

                <span
                  className={cn(
                    "relative z-10 text-[9px] font-medium tracking-wide transition-colors duration-200",
                    isActive ? "text-foreground" : "text-text-tertiary",
                  )}
                >
                  {tab.label}
                </span>

              </button>
            )
          })}
        </div>
      </BottomNavShell>
    </nav>
  )
}
