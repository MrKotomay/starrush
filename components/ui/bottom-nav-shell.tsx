import * as React from "react"

import { cn } from "@/lib/utils"

export function BottomNavShell({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative isolate overflow-hidden rounded-[20px] border border-white/6 bg-[hsl(var(--surface-1)/0.38)] shadow-[0_14px_36px_rgba(4,7,22,0.42)] backdrop-blur-[14px] backdrop-saturate-150 supports-[backdrop-filter]:bg-[hsl(var(--surface-1)/0.3)] before:pointer-events-none before:absolute before:inset-0 before:rounded-[20px] before:bg-[linear-gradient(180deg,rgba(255,255,255,0.12)_0%,rgba(255,255,255,0.04)_50%,rgba(255,255,255,0)_100%)] before:opacity-80",
        className,
      )}
      {...props}
    />
  )
}
