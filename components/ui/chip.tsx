import * as React from "react"

import { cn } from "@/lib/utils"

interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean
}

export const Chip = React.forwardRef<HTMLButtonElement, ChipProps>(
  ({ className, active = false, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      data-active={active ? "true" : "false"}
      className={cn(
        "chip-control focus-brand inline-flex min-h-8 items-center justify-center px-3 text-xs font-semibold",
        className,
      )}
      {...props}
    />
  ),
)

Chip.displayName = "Chip"

