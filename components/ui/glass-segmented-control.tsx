"use client"

import * as React from "react"
import { motion, useReducedMotion, type Transition } from "framer-motion"

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
  motionMode?: "default" | "static"
  indicatorTransition?: Transition
  indicatorSheen?: "on" | "off"
  activeButtonChrome?: "on" | "off"
  className?: string
  disabled?: boolean
}

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]
const INDICATOR_SPRING = { type: "spring", stiffness: 500, damping: 36, mass: 0.7 } as const

type IndicatorMetrics = {
  left: number
  top: number
  width: number
  height: number
  borderRadius: string
} | null

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
  motionMode = "default",
  indicatorTransition,
  indicatorSheen = "on",
  activeButtonChrome = "on",
  className,
  disabled = false,
}: GlassSegmentedControlProps<T>) {
  const shouldReduceMotion = useReducedMotion()
  const resolvedIndicatorTransition = indicatorTransition ?? (shouldReduceMotion
    ? ({ duration: 0.12 } as const)
    : INDICATOR_SPRING)
  const pressScale = shouldReduceMotion ? 1 : 0.985
  const rootRef = React.useRef<HTMLDivElement | null>(null)
  const buttonRefs = React.useRef<Record<string, HTMLButtonElement | null>>({})
  const [indicatorMetrics, setIndicatorMetrics] = React.useState<IndicatorMetrics>(null)
  const itemIdsKey = React.useMemo(() => items.map((item) => item.id).join("|"), [items])

  const updateIndicatorMetrics = React.useCallback(() => {
    if (motionMode === "static") {
      setIndicatorMetrics(null)
      return
    }

    const root = rootRef.current
    const activeButton = buttonRefs.current[value]
    if (!root || !activeButton) {
      setIndicatorMetrics(null)
      return
    }

    const rootRect = root.getBoundingClientRect()
    const buttonRect = activeButton.getBoundingClientRect()
    const buttonStyles = window.getComputedStyle(activeButton)
    const next: Exclude<IndicatorMetrics, null> = {
      left: Number((buttonRect.left - rootRect.left).toFixed(3)),
      top: Number((buttonRect.top - rootRect.top).toFixed(3)),
      width: Number(buttonRect.width.toFixed(3)),
      height: Number(buttonRect.height.toFixed(3)),
      borderRadius: buttonStyles.borderRadius,
    }

    setIndicatorMetrics((prev) => {
      if (
        prev &&
        prev.left === next.left &&
        prev.top === next.top &&
        prev.width === next.width &&
        prev.height === next.height &&
        prev.borderRadius === next.borderRadius
      ) {
        return prev
      }
      return next
    })
  }, [motionMode, value])

  React.useLayoutEffect(() => {
    if (motionMode === "static") {
      setIndicatorMetrics(null)
      return
    }
    updateIndicatorMetrics()
  }, [motionMode, updateIndicatorMetrics, itemIdsKey, size])

  React.useEffect(() => {
    if (motionMode === "static") {
      setIndicatorMetrics(null)
      return
    }

    const root = rootRef.current
    if (!root || typeof window === "undefined" || typeof window.ResizeObserver === "undefined") {
      return
    }

    const observer = new ResizeObserver(() => updateIndicatorMetrics())
    observer.observe(root)
    items.forEach((item) => {
      const node = buttonRefs.current[item.id]
      if (node) observer.observe(node)
    })

    window.addEventListener("resize", updateIndicatorMetrics, { passive: true })
    window.visualViewport?.addEventListener("resize", updateIndicatorMetrics)

    return () => {
      observer.disconnect()
      window.removeEventListener("resize", updateIndicatorMetrics)
      window.visualViewport?.removeEventListener("resize", updateIndicatorMetrics)
    }
  }, [items, motionMode, updateIndicatorMetrics])

  return (
    <div
      ref={rootRef}
      className={cn("glass-segmented", className)}
      data-size={size}
      data-layout-id={layoutId}
      data-motion-mode={motionMode}
      data-indicator-sheen={indicatorSheen}
      data-active-chrome={activeButtonChrome}
      role="tablist"
      aria-label={ariaLabel}
    >
      {motionMode === "default" && indicatorMetrics ? (
        <motion.span
          className="glass-segmented-indicator"
          style={{
            inset: "auto",
            left: indicatorMetrics.left,
            top: indicatorMetrics.top,
            width: indicatorMetrics.width,
            height: indicatorMetrics.height,
            borderRadius: indicatorMetrics.borderRadius,
          }}
          initial={false}
          animate={{
            left: indicatorMetrics.left,
            top: indicatorMetrics.top,
            width: indicatorMetrics.width,
            height: indicatorMetrics.height,
          }}
          transition={resolvedIndicatorTransition}
          aria-hidden="true"
        />
      ) : null}

      {items.map((item) => {
        const active = item.id === value
        const itemDisabled = disabled || item.disabled
        return (
          <motion.button
            key={item.id}
            ref={(node) => {
              buttonRefs.current[item.id] = node
            }}
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
            {renderIcon(item.icon, "glass-segmented-icon")}
            <span className="glass-segmented-label">{item.label}</span>
          </motion.button>
        )
      })}
    </div>
  )
}
