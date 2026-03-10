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
}

const SHELL_BACKGROUND = "#070c16"
const SHELL_CHROME = "#0d1525"

/**
 * Check if the Telegram WebApp version supports a feature.
 * Feature minimum versions:
 * - setBackgroundColor: 6.1
 * - setHeaderColor: 6.1
 * - setBottomBarColor: 7.10
 * - disableVerticalSwipes: 7.7
 * - requestFullscreen: 8.0
 */
function isVersionAtLeast(version: string | undefined, minVersion: string): boolean {
  if (!version) return false
  const [major, minor = 0] = version.split(".").map(Number)
  const [minMajor, minMinor = 0] = minVersion.split(".").map(Number)
  return major > minMajor || (major === minMajor && minor >= minMinor)
}

function applyShellTheme(webApp: TelegramWebApp) {
  const version = webApp.version

  // setBackgroundColor requires version 6.1+
  if (isVersionAtLeast(version, "6.1")) {
    try {
      webApp.setBackgroundColor?.(SHELL_BACKGROUND)
    } catch {
      // Telegram shell theming is best effort.
    }
  }

  // setHeaderColor requires version 6.1+
  if (isVersionAtLeast(version, "6.1")) {
    try {
      webApp.setHeaderColor?.(SHELL_CHROME)
    } catch {
      // ignore unsupported clients
    }
  }

  // setBottomBarColor requires version 7.10+
  if (isVersionAtLeast(version, "7.10")) {
    try {
      webApp.setBottomBarColor?.(SHELL_CHROME)
    } catch {
      // ignore unsupported clients
    }
  }

  // disableVerticalSwipes requires version 7.7+
  if (isVersionAtLeast(version, "7.7")) {
    try {
      webApp.disableVerticalSwipes?.()
    } catch {
      // ignore unsupported clients
    }
  }

  // expand is available since version 6.0
  try {
    webApp.expand?.()
  } catch {
    // ignore unsupported clients
  }

  // requestFullscreen requires version 8.0+
  if (isVersionAtLeast(version, "8.0")) {
    try {
      void webApp.requestFullscreen?.()
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
