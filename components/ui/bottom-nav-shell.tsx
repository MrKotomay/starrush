import * as React from "react"

import { cn } from "@/lib/utils"

export function BottomNavShell({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "glass-pill relative isolate overflow-hidden rounded-[var(--radius-xl)] border border-white/8 shadow-[0_14px_36px_rgba(4,7,22,0.42)] before:pointer-events-none before:absolute before:inset-0 before:bg-[linear-gradient(180deg,rgba(255,255,255,0.14)_0%,rgba(255,255,255,0.05)_40%,transparent_100%)]",
        className,
      )}
      {...props}
    />
  )
}
