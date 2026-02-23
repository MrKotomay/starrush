"use client"

import { useEffect } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { Rocket, TrendingUp, User } from "lucide-react"

import { cn } from "@/lib/utils"
import { BottomNavShell } from "@/components/ui/bottom-nav-shell"

type TabId = "staking" | "mine" | "profile"

interface BottomNavigationProps {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
}

const tabs = [
  { id: "staking" as TabId, label: "Стейкинг", icon: TrendingUp },
  { id: "mine" as TabId, label: "Раш", icon: Rocket },
  { id: "profile" as TabId, label: "Профиль", icon: User },
]

export function BottomNavigation({ activeTab, onTabChange }: BottomNavigationProps) {
  const shouldReduceMotion = useReducedMotion()

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
                  "focus-brand relative flex min-w-[95px] flex-col items-center gap-0.5 rounded-[16px] px-4 py-1.5 transition-colors duration-200 ease-out",
                  isActive ? "text-foreground" : "text-text-tertiary",
                )}
                aria-current={isActive ? "page" : undefined}
                type="button"
              >
                {isActive ? (
                  <motion.span
                    layoutId="bottom-nav-active-pill"
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 rounded-[16px] border border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.08)_0%,rgba(255,255,255,0.03)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]"
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
                    <Icon
                      className={cn(
                        "relative z-10 h-3.5 w-3.5 transition-colors duration-200",
                        isActive ? "text-foreground" : "text-text-tertiary",
                      )}
                    />
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
