"use client"

import { useCallback } from "react"

import { useAppSettings } from "@/lib/app-settings"

type TelegramHapticFeedback = {
  impactOccurred?: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void
  notificationOccurred?: (type: "error" | "success" | "warning") => void
  selectionChanged?: () => void
}

function getTelegramHaptics(): TelegramHapticFeedback | undefined {
  if (typeof window === "undefined") return undefined
  const source = window as typeof window & {
    Telegram?: {
      WebApp?: {
        HapticFeedback?: TelegramHapticFeedback
      }
    }
  }

  return source.Telegram?.WebApp?.HapticFeedback
}

function vibrate(pattern: number | number[]) {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return false
  return navigator.vibrate(pattern)
}

export function useHaptics() {
  const { hapticsEnabled } = useAppSettings()

  const fireImpact = useCallback(
    (style: "light" | "medium" | "heavy" | "rigid" | "soft", fallbackPattern: number | number[]) => {
      if (!hapticsEnabled) return
      const haptics = getTelegramHaptics()
      if (haptics?.impactOccurred) {
        haptics.impactOccurred(style)
        return
      }
      vibrate(fallbackPattern)
    },
    [hapticsEnabled],
  )

  const fireNotification = useCallback(
    (type: "error" | "success" | "warning", fallbackPattern: number | number[]) => {
      if (!hapticsEnabled) return
      const haptics = getTelegramHaptics()
      if (haptics?.notificationOccurred) {
        haptics.notificationOccurred(type)
        return
      }
      vibrate(fallbackPattern)
    },
    [hapticsEnabled],
  )

  const betPlaced = useCallback(() => {
    fireImpact("light", 14)
  }, [fireImpact])

  const cashoutSuccess = useCallback(() => {
    fireNotification("success", [16, 40, 18])
  }, [fireNotification])

  const roundCrash = useCallback(() => {
    fireNotification("error", [28, 45, 22, 40, 18])
  }, [fireNotification])

  return {
    enabled: hapticsEnabled,
    betPlaced,
    cashoutSuccess,
    roundCrash,
  }
}
