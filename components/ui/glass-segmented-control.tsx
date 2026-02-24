"use client"

import * as React from "react"
import { LayoutGroup, motion, useReducedMotion, type Transition } from "framer-motion"

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
  indicatorTransition?: Transition
  indicatorSheen?: "on" | "off"
  className?: string
  disabled?: boolean
}

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]
const INDICATOR_SPRING = { type: "spring", stiffness: 500, damping: 36, mass: 0.7 } as const

function renderIcon(icon: SegmentedIcon | undefined, className: string) {
  if (!icon) return null
  if (React.isValidElement(icon)) {
    return <span className={className}>{icon}</span>
  }

  if (
    typeof icon === "function" ||
    (typeof icon === "object" && icon !== null && "$$typeof" in icon)
  ) {
    const Icon = icon as React.ComponentType<{ className?: string }>
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
  indicatorTransition,
  indicatorSheen = "on",
  className,
  disabled = false,
}: GlassSegmentedControlProps<T>) {
  const shouldReduceMotion = useReducedMotion()
  const resolvedIndicatorTransition = indicatorTransition ?? (shouldReduceMotion
    ? ({ duration: 0.12 } as const)
    : INDICATOR_SPRING)
  const pressScale = shouldReduceMotion ? 1 : 0.985

  return (
    <LayoutGroup id={layoutId}>
      <div
        className={cn("glass-segmented", className)}
        data-size={size}
        data-indicator-sheen={indicatorSheen}
        role="tablist"
        aria-label={ariaLabel}
      >
        {items.map((item) => {
          const active = item.id === value
          const itemDisabled = disabled || item.disabled
          return (
            <motion.button
              key={item.id}
              layout="position"
              type="button"
              role="tab"
              aria-selected={active}
              disabled={itemDisabled}
              className="glass-segmented-btn"
              data-active={active ? "true" : "false"}
              onClick={() => onChange(item.id)}
              whileTap={{ scale: pressScale }}
              transition={{ duration: shouldReduceMotion ? 0.1 : 0.16, ease: EASE }}
            >
              {active ? (
                <motion.span
                  layout="position"
                  layoutId={layoutId}
                  className="glass-segmented-indicator"
                  transition={resolvedIndicatorTransition}
                  aria-hidden="true"
                />
              ) : null}
              {renderIcon(item.icon, "glass-segmented-icon")}
              <span className="glass-segmented-label">{item.label}</span>
            </motion.button>
          )
        })}
      </div>
    </LayoutGroup>
  )
}
