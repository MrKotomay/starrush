"use client"

import * as React from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"

import { cn } from "@/lib/utils"

/* ─── Sheet Handle ──────────────────────────────────── */

function SheetHandle() {
  return (
    <div className="flex justify-center pt-2.5 pb-1" aria-hidden="true">
      <div className="h-[4px] w-9 rounded-full bg-white/20" />
    </div>
  )
}

/* ─── Sheet Overlay ─────────────────────────────────── */

interface SheetOverlayProps {
  onClose?: () => void
}

function SheetOverlay({ onClose }: SheetOverlayProps) {
  const shouldReduceMotion = useReducedMotion()
  return (
    <motion.div
      className="sheet-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: shouldReduceMotion ? 0.1 : 0.2 }}
      onClick={onClose}
      aria-hidden="true"
    />
  )
}

/* ─── Glass Sheet ───────────────────────────────────── */

interface GlassSheetProps {
  open: boolean
  onClose?: () => void
  children: React.ReactNode
  className?: string
  /** Whether to show the drag handle at the top */
  handle?: boolean
  /** Additional data attributes to place on the sheet container */
  "data-ui"?: string
}

const SHEET_SPRING = { type: "spring", stiffness: 380, damping: 34, mass: 0.8 } as const

export function GlassSheet({
  open,
  onClose,
  children,
  className,
  handle = true,
  ...rest
}: GlassSheetProps) {
  const shouldReduceMotion = useReducedMotion()
  const transition = shouldReduceMotion
    ? ({ duration: 0.12 } as const)
    : SHEET_SPRING

  return (
    <AnimatePresence>
      {open ? (
        <>
          <SheetOverlay onClose={onClose} />
          <motion.div
            role="dialog"
            aria-modal="true"
            className={cn(
              "glass-sheet fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto",
              className,
            )}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={transition}
            data-ui={rest["data-ui"]}
          >
            {handle ? <SheetHandle /> : null}
            {children}
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  )
}
