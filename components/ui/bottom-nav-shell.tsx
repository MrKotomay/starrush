import * as React from "react"

import { cn } from "@/lib/utils"

export function BottomNavShell({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "glass-pill relative isolate overflow-hidden rounded-[999px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.12)_0%,rgba(255,255,255,0.03)_34%,rgba(255,255,255,0.01)_100%)] shadow-[0_22px_44px_rgba(2,6,18,0.28)] before:pointer-events-none before:absolute before:inset-0 before:bg-[linear-gradient(180deg,rgba(255,255,255,0.18)_0%,rgba(255,255,255,0.06)_28%,transparent_100%)] after:pointer-events-none after:absolute after:inset-[1px] after:rounded-[999px] after:border after:border-white/6",
        className,
      )}
      {...props}
    />
  )
}
