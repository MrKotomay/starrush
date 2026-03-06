"use client"

import { useEffect } from "react"

type TelegramWebApp = {
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

  try {
    void webApp.requestFullscreen?.()
  } catch {
    // ignore unsupported clients
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
