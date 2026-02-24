import * as React from "react"

import { cn } from "@/lib/utils"

type StatIconTone = "violet" | "blue" | "mint" | "gold"

const toneStyles: Record<StatIconTone, { text: string; bg: string; glow: string }> = {
  violet: {
    text: "text-brand-soft",
    bg: "bg-gradient-to-br from-brand-1/28 to-brand-2/18",
    glow: "shadow-[0_4px_14px_rgba(101,29,203,0.2)]",
  },
  blue: {
    text: "text-info",
    bg: "bg-gradient-to-br from-info/22 to-brand-1/14",
    glow: "shadow-[0_4px_14px_rgba(74,163,255,0.18)]",
  },
  mint: {
    text: "text-success",
    bg: "bg-gradient-to-br from-success/22 to-info/12",
    glow: "shadow-[0_4px_14px_rgba(53,211,155,0.18)]",
  },
  gold: {
    text: "text-star",
    bg: "bg-gradient-to-br from-star/22 to-warning/14",
    glow: "shadow-[0_4px_14px_rgba(253,225,130,0.18)]",
  },
}

interface StatIconProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: StatIconTone
}

export function StatIcon({ tone = "violet", className, ...props }: StatIconProps) {
  const style = toneStyles[tone]
  return (
    <div
      className={cn(
        "inline-flex h-12 w-12 items-center justify-center rounded-[14px]",
        style.bg,
        style.glow,
        style.text,
        className,
      )}
      {...props}
    />
  )
}
