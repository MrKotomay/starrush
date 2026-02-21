import * as React from "react"

import { cn } from "@/lib/utils"

type GlassCardVariant = "default" | "hero" | "elevated"

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: GlassCardVariant
}

const variantClassMap: Record<GlassCardVariant, string> = {
  default: "glass-card",
  hero: "glass-card-hero",
  elevated: "card-elevated",
}

export function GlassCard({
  variant = "default",
  className,
  ...props
}: GlassCardProps) {
  return (
    <div
      className={cn(variantClassMap[variant], className)}
      {...props}
    />
  )
}

