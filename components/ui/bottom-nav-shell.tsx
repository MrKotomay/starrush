import * as React from "react"

import { cn } from "@/lib/utils"

export function BottomNavShell({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "glass-pill relative isolate overflow-hidden rounded-[999px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.09)_0%,rgba(255,255,255,0.03)_28%,rgba(255,255,255,0.01)_100%)] shadow-[0_14px_28px_rgba(2,6,18,0.2)] before:pointer-events-none before:absolute before:inset-0 before:bg-[linear-gradient(180deg,rgba(255,255,255,0.14)_0%,rgba(255,255,255,0.04)_22%,transparent_100%)] after:pointer-events-none after:absolute after:inset-[1px] after:rounded-[999px] after:border after:border-white/5",
        className,
      )}
      {...props}
    />
  )
}
