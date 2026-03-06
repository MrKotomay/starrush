import * as React from "react"

import { cn } from "@/lib/utils"

export function BottomNavShell({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "glass-pill relative isolate overflow-hidden rounded-[999px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.10)_0%,rgba(255,255,255,0.03)_30%,rgba(255,255,255,0.01)_100%)] shadow-[0_18px_34px_rgba(2,6,18,0.24)] before:pointer-events-none before:absolute before:inset-0 before:bg-[linear-gradient(180deg,rgba(255,255,255,0.16)_0%,rgba(255,255,255,0.05)_24%,transparent_100%)] after:pointer-events-none after:absolute after:inset-[1px] after:rounded-[999px] after:border after:border-white/6",
        className,
      )}
      {...props}
    />
  )
}
