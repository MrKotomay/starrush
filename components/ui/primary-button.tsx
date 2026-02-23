import * as React from "react"

import { cn } from "@/lib/utils"

interface PrimaryButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  breathing?: boolean
  variant?: "brand" | "brandSoft" | "glass"
  depth?: "flat" | "raised"
  motion?: "none" | "subtle"
}

export const PrimaryButton = React.forwardRef<HTMLButtonElement, PrimaryButtonProps>(
  (
    {
      className,
      breathing = false,
      disabled,
      type = "button",
      variant = "brand",
      depth = "raised",
      motion = "subtle",
      ...props
    },
    ref,
  ) => {
    const variantClass = variant === "brandSoft" ? "btn-primary-brand-soft" : variant === "glass" ? "btn-primary-glass" : ""
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled}
        className={cn(
          "btn-primary-glow focus-brand inline-flex items-center justify-center gap-2 rounded-[14px] px-4 py-3 text-sm font-semibold tracking-wide",
          variantClass,
          depth === "flat" ? "btn-depth-flat" : "btn-depth-raised",
          motion === "none" ? "btn-motion-none" : "",
          breathing && !disabled && motion !== "none" ? "glow-breathe" : "",
          className,
        )}
        {...props}
      />
    )
  },
)

PrimaryButton.displayName = "PrimaryButton"
