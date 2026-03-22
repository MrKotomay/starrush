"use client"

import { useEffect } from "react"

type TelegramWebApp = {
  version?: string
  expand?: () => void
  ready?: () => void
  requestFullscreen?: () => Promise<unknown> | void
  disableVerticalSwipes?: () => void
  setHeaderColor?: (color: string) => void
  setBackgroundColor?: (color: string) => void
  setBottomBarColor?: (color: string) => void
  isVersionAtLeast?: (version: string) => boolean
}

const SHELL_BACKGROUND = "#070c16"
const SHELL_CHROME = "#0d1525"

function compareVersions(left: string, right: string): number {
  const leftParts = left.split(".").map((part) => Number.parseInt(part, 10) || 0)
  const rightParts = right.split(".").map((part) => Number.parseInt(part, 10) || 0)
  const length = Math.max(leftParts.length, rightParts.length)

  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index] ?? 0
    const rightPart = rightParts[index] ?? 0
    if (leftPart !== rightPart) return leftPart - rightPart
  }

  return 0
}

function supportsFullscreen(webApp: TelegramWebApp): boolean {
  if (typeof webApp.requestFullscreen !== "function") return false

  try {
    if (typeof webApp.isVersionAtLeast === "function") {
      return webApp.isVersionAtLeast("8.0")
    }
  } catch {
    // fall through to version string check
  }

  if (typeof webApp.version !== "string" || !webApp.version.trim()) {
    return false
  }

  return compareVersions(webApp.version, "8.0") >= 0
}

function applyShellTheme(webApp: TelegramWebApp) {
  try {
    webApp.setBackgroundColor?.(SHELL_BACKGROUND)
  } catch {
    // Telegram shell theming is best effort.
  }

  try {
    webApp.setHeaderColor?.(SHELL_CHROME)
  } catch {
    // ignore unsupported clients
  }

  try {
    webApp.setBottomBarColor?.(SHELL_CHROME)
  } catch {
    // ignore unsupported clients
  }

  try {
    webApp.disableVerticalSwipes?.()
  } catch {
    // ignore unsupported clients
  }

  try {
    webApp.expand?.()
  } catch {
    // ignore unsupported clients
  }

  if (supportsFullscreen(webApp)) {
    try {
      const requestFullscreen = webApp.requestFullscreen
      if (typeof requestFullscreen === "function") {
        void requestFullscreen.call(webApp)
      }
    } catch {
      // ignore unsupported clients
    }
  }
}

export function TelegramShellTheme() {
  useEffect(() => {
    let cancelled = false
    let timeoutId: number | null = null
    let attempts = 0

    const sync = () => {
      if (cancelled || typeof window === "undefined") return

      const webApp = (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp
      attempts += 1

      if (webApp) {
        applyShellTheme(webApp)
      }

      if (!cancelled && attempts < 8) {
        timeoutId = window.setTimeout(sync, webApp ? 320 : 180)
      }
    }

    sync()

    return () => {
      cancelled = true
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
    }
  }, [])

  return null
}
