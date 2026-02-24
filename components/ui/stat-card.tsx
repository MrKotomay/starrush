import * as React from "react"

import { cn } from "@/lib/utils"
import { GlassCard } from "@/components/ui/glass-card"

interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: React.ReactNode
  value: React.ReactNode
  icon?: React.ReactNode
  iconClassName?: string
  iconVariant?: "badge" | "plain"
}

export function StatCard({
  label,
  value,
  icon,
  iconClassName,
  iconVariant = "badge",
  className,
  ...props
}: StatCardProps) {
  return (
    <GlassCard
      variant="elevated"
      className={cn("rounded-[var(--radius-lg)] p-4", className)}
      {...props}
    >
      {icon ? (
        <div
          className={cn(
            iconVariant === "plain"
              ? "mb-3 flex h-11 w-11 items-center justify-center"
              : "mb-3 flex h-10 w-10 items-center justify-center rounded-xl",
            iconClassName,
          )}
        >
          {icon}
        </div>
      ) : null}
      <p className="mb-1 text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold leading-tight text-foreground">{value}</p>
    </GlassCard>
  )
}
