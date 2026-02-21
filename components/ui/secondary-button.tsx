import * as React from "react"

import { cn } from "@/lib/utils"

export const SecondaryButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, disabled, type = "button", ...props }, ref) => (
  <button
    ref={ref}
    type={type}
    disabled={disabled}
    className={cn(
      "btn-secondary focus-brand inline-flex items-center justify-center gap-2 rounded-[14px] px-4 py-3 text-sm font-semibold tracking-wide",
      className,
    )}
    {...props}
  />
))

SecondaryButton.displayName = "SecondaryButton"

