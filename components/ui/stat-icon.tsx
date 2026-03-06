import * as React from "react"

import { cn } from "@/lib/utils"

type StatIconTone = "violet" | "blue" | "mint" | "gold"

const toneClassMap: Record<StatIconTone, string> = {
  violet: "text-brand-soft",
  blue: "text-info",
  mint: "text-success",
  gold: "text-star",
}

interface StatIconProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: StatIconTone
}

export function StatIcon({ tone = "violet", className, ...props }: StatIconProps) {
  return (
    <div
      className={cn(
        "inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] border border-white/8 bg-white/[0.03] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
        toneClassMap[tone],
        className,
      )}
      {...props}
    />
  )
}
