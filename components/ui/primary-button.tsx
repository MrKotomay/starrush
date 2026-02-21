import * as React from "react"

import { cn } from "@/lib/utils"

interface PrimaryButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  breathing?: boolean
}

export const PrimaryButton = React.forwardRef<HTMLButtonElement, PrimaryButtonProps>(
  ({ className, breathing = false, disabled, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      disabled={disabled}
      className={cn(
        "btn-primary-glow focus-brand inline-flex items-center justify-center gap-2 rounded-[14px] px-4 py-3 text-sm font-semibold tracking-wide",
        breathing && !disabled ? "glow-breathe" : "",
        className,
      )}
      {...props}
    />
  ),
)

PrimaryButton.displayName = "PrimaryButton"

