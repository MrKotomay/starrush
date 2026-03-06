import * as React from "react"

import { cn } from "@/lib/utils"

interface SecondaryButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean
}

export const SecondaryButton = React.forwardRef<HTMLButtonElement, SecondaryButtonProps>(
  ({ className, disabled, type = "button", loading = false, children, ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        "btn-secondary focus-brand inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] px-4 py-3 text-sm font-semibold tracking-[0.01em]",
        loading ? "btn-loading" : "",
        className,
      )}
      {...props}
    >
      {loading ? <span className="btn-spinner" aria-hidden="true" /> : null}
      {children}
    </button>
  ),
)

SecondaryButton.displayName = "SecondaryButton"

