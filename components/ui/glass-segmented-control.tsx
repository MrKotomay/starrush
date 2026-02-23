"use client"

import * as React from "react"
import { motion, useReducedMotion } from "framer-motion"

import { cn } from "@/lib/utils"

type SegmentedIcon = React.ReactNode | React.ComponentType<{ className?: string }>

export type GlassSegmentedItem<T extends string> = {
  id: T
  label: string
  icon?: SegmentedIcon
  disabled?: boolean
}

interface GlassSegmentedControlProps<T extends string> {
  items: readonly GlassSegmentedItem<T>[]
  value: T
  onChange: (id: T) => void
  ariaLabel: string
  size?: "sm" | "md"
  layoutId?: string
  className?: string
  disabled?: boolean
}

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

function renderIcon(icon: SegmentedIcon | undefined, className: string) {
  if (!icon) return null
  if (typeof icon === "function") {
    const Icon = icon
    return <Icon className={className} />
  }
  return <span className={className}>{icon}</span>
}

export function GlassSegmentedControl<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  size = "md",
  layoutId = "glass-segmented-indicator",
  className,
  disabled = false,
}: GlassSegmentedControlProps<T>) {
  const shouldReduceMotion = useReducedMotion()
  const transition = shouldReduceMotion ? { duration: 0.1 } : { duration: 0.24, ease: EASE }

  return (
    <div className={cn("glass-segmented", className)} data-size={size} role="tablist" aria-label={ariaLabel}>
      {items.map((item) => {
        const active = item.id === value
        const itemDisabled = disabled || item.disabled
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={itemDisabled}
            className="glass-segmented-btn"
            data-active={active ? "true" : "false"}
            onClick={() => onChange(item.id)}
          >
            {active ? (
              <motion.span
                layoutId={layoutId}
                className="glass-segmented-indicator"
                transition={transition}
                aria-hidden="true"
              />
            ) : null}
            {renderIcon(item.icon, "glass-segmented-icon")}
            <span className="glass-segmented-label">{item.label}</span>
          </button>
        )
      })}
    </div>
  )
}

