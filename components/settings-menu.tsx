"use client"

import type { ReactNode } from "react"
import { ChevronRight, Settings, Wallet, Zap } from "lucide-react"

import { cn } from "@/lib/utils"
import { GlassCard } from "@/components/ui/glass-card"

type MenuItemId = "wallet" | "staking" | "settings"

interface MenuItem {
  id: MenuItemId
  icon: ReactNode
  label: string
  value?: string
  valueColor?: string
  iconClassName: string
}

const menuItems: MenuItem[] = [
  {
    id: "wallet",
    icon: <Wallet className="h-5 w-5 text-foreground" />,
    label: "Кошелек",
    value: "Открыть",
    valueColor: "text-brand-soft",
    iconClassName: "bg-gradient-to-br from-brand-1 to-brand-2",
  },
  {
    id: "staking",
    icon: <Zap className="h-5 w-5 text-foreground" />,
    label: "Стейкинг",
    value: "Активен",
    valueColor: "text-brand-soft",
    iconClassName: "bg-gradient-to-br from-brand-2 to-brand-1",
  },
  {
    id: "settings",
    icon: <Settings className="h-5 w-5 text-foreground" />,
    label: "Настройки",
    iconClassName: "bg-gradient-to-br from-surface-3 to-surface-2",
  },
]

interface SettingsMenuProps {
  onWalletClick?: () => void
  onStakingClick?: () => void
  onSettingsClick?: () => void
}

export function SettingsMenu({
  onWalletClick,
  onStakingClick,
  onSettingsClick,
}: SettingsMenuProps) {
  const handleClick = (id: MenuItemId) => {
    if (id === "wallet") {
      onWalletClick?.()
      return
    }
    if (id === "staking") {
      onStakingClick?.()
      return
    }
    onSettingsClick?.()
  }

  return (
    <GlassCard variant="elevated" className="overflow-hidden rounded-[var(--radius-lg)] p-0">
      {menuItems.map((item, index) => (
        <button
          key={item.id}
          type="button"
          onClick={() => handleClick(item.id)}
          data-sheen="event"
          className={cn(
            "focus-brand liquid-sheen flex w-full items-center justify-between p-4 text-left transition-all duration-200 hover:bg-surface-2/70 active:translate-y-[1px]",
            index !== menuItems.length - 1 ? "border-b border-white/6" : "",
          )}
        >
          <div className="flex items-center gap-3">
            <div className={cn("flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] border border-white/12 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]", item.iconClassName)}>
              {item.icon}
            </div>
            <span className="font-medium text-foreground">{item.label}</span>
          </div>
          <div className="flex items-center gap-2">
            {item.value ? (
              <span className={cn("text-sm", item.valueColor)}>{item.value}</span>
            ) : null}
            <ChevronRight className="h-5 w-5 text-text-tertiary" />
          </div>
        </button>
      ))}
    </GlassCard>
  )
}
