"use client"

import type { ReactNode } from "react"
import { ChevronRight, Settings, Wallet, Zap } from "lucide-react"

import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { GlassCard } from "@/components/ui/glass-card"

type MenuItemId = "wallet" | "staking" | "settings"

interface MenuItem {
  id: MenuItemId
  icon: ReactNode
  labelKey: string
  valueKey?: string
  valueColor?: string
  iconClassName: string
}

const menuItems: MenuItem[] = [
  {
    id: "wallet",
    icon: <Wallet className="h-5 w-5 text-foreground" />,
    labelKey: "settingsMenu.wallet",
    valueKey: "settingsMenu.open",
    valueColor: "text-brand-soft",
    iconClassName: "bg-gradient-to-br from-brand-1 to-brand-2",
  },
  {
    id: "staking",
    icon: <Zap className="h-5 w-5 text-foreground" />,
    labelKey: "settingsMenu.staking",
    valueKey: "settingsMenu.active",
    valueColor: "text-brand-soft",
    iconClassName: "bg-gradient-to-br from-brand-2 to-brand-1",
  },
  {
    id: "settings",
    icon: <Settings className="h-5 w-5 text-foreground" />,
    labelKey: "settingsMenu.settings",
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
  const { t } = useI18n()

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
            "focus-brand liquid-sheen flex w-full items-center justify-between p-4 text-left transition-all duration-300 hover:bg-surface-2/70 active:translate-y-[1px]",
            index !== menuItems.length - 1 ? "border-b border-white/6" : "",
          )}
        >
          <div className="flex items-center gap-3">
            <div className={cn("flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] border border-white/8 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]", item.iconClassName)}>
              {item.icon}
            </div>
            <span className="font-medium text-foreground">{t(item.labelKey)}</span>
          </div>
          <div className="flex items-center gap-2">
            {item.valueKey ? (
              <span className={cn("text-sm", item.valueColor)}>{t(item.valueKey)}</span>
            ) : null}
            <ChevronRight className="h-5 w-5 text-text-tertiary" />
          </div>
        </button>
      ))}
    </GlassCard>
  )
}
