"use client"

import { useEffect, useState } from "react"
import type { TelegramWebAppUser } from "@/lib/telegram-auth"

type TelegramAuthState =
  | { status: "idle" }
  | { status: "no-telegram" }
  | { status: "loading" }
  | {
      status: "ready"
      user?: TelegramWebAppUser
      dbUser?: { id: string; telegramId: string }
      wallets?: Array<{ id: string; currency: "TON" | "STARS"; balance: string; lockedBalance: string }>
      isDevMode?: boolean
    }
  | { status: "error"; error: string }

type TelegramWebApp = {
  initData?: string
  ready?: () => void
  expand?: () => void
}

type TelegramGlobal = {
  WebApp?: TelegramWebApp
}

function getTelegramWebApp(): TelegramWebApp | undefined {
  if (typeof window === "undefined") return undefined
  const w = window as unknown as { Telegram?: TelegramGlobal }
  return w.Telegram?.WebApp
}

function getStartParamFromLocation(): string | undefined {
  if (typeof window === "undefined") return undefined
  const params = new URLSearchParams(window.location.search)
  return (
    params.get("tgWebAppStartParam") ??
    params.get("startapp") ??
    params.get("start") ??
    undefined
  )
}

type TelegramAuthResponse =
  | {
      ok: true
      user?: TelegramWebAppUser
      dbUser?: { id: string; telegramId: string }
      wallets?: Array<{ id: string; currency: "TON" | "STARS"; balance: string; lockedBalance: string }>
    }
  | { ok: false; error?: string }

type DevAuthCheckResponse = {
  enabled: boolean
  env: string
}

async function tryDevAuth(
  signal: AbortSignal
): Promise<{ success: true; data: TelegramAuthResponse & { ok: true } } | { success: false }> {
  try {
    // First check if dev auth is enabled
    const checkRes = await fetch("/api/auth/dev", { signal })
    const checkJson = (await checkRes.json()) as DevAuthCheckResponse
    if (!checkJson.enabled) {
      return { success: false }
    }

    // Use dev auth
    const authRes = await fetch("/api/auth/dev", {
      method: "POST",
      signal,
    })
    const authJson = (await authRes.json()) as TelegramAuthResponse
    if (authRes.ok && authJson.ok) {
      return { success: true, data: authJson as TelegramAuthResponse & { ok: true } }
    }
    return { success: false }
  } catch {
    return { success: false }
  }
}

export function useTelegramUser() {
  const [state, setState] = useState<TelegramAuthState>({ status: "idle" })

  useEffect(() => {
    // AUTH RETRY LOGIC
    let cancelled = false
    let attempts = 0
    let initDataAttempts = 0
    let authAttempts = 0
    const maxAttempts = 10
    const maxInitDataAttempts = 6
    const maxAuthAttempts = 3
    const retryDelayMs = 300
    let controller: AbortController | null = null

    const init = () => {
      const tg = getTelegramWebApp()
      if (!tg) {
        attempts += 1
        if (attempts < maxAttempts && !cancelled) {
          setTimeout(init, retryDelayMs)
          return
        }
        // Telegram not available after retries - try dev auth
        if (!cancelled) {
          setState({ status: "loading" })
          controller = new AbortController()
          tryDevAuth(controller.signal).then((result) => {
            if (cancelled) return
            if (result.success) {
              setState({
                status: "ready",
                user: result.data.user,
                dbUser: result.data.dbUser,
                wallets: result.data.wallets,
                isDevMode: true,
              })
            } else {
              setState({ status: "error", error: `NO_TELEGRAM_AFTER_${maxAttempts}` })
            }
          })
        }
        return
      }

      const initData: unknown = tg.initData
      if (!initData || typeof initData !== "string") {
        initDataAttempts += 1
        if (initDataAttempts < maxInitDataAttempts && !cancelled) {
          setTimeout(init, retryDelayMs)
          return
        }
        // No initData after retries - try dev auth
        if (!cancelled) {
          setState({ status: "loading" })
          controller = new AbortController()
          tryDevAuth(controller.signal).then((result) => {
            if (cancelled) return
            if (result.success) {
              setState({
                status: "ready",
                user: result.data.user,
                dbUser: result.data.dbUser,
                wallets: result.data.wallets,
                isDevMode: true,
              })
            } else {
              setState({ status: "error", error: `NO_INIT_DATA_AFTER_${maxInitDataAttempts}` })
            }
          })
        }
        return
      }

      if (!cancelled) setState({ status: "loading" })

      controller = new AbortController()

      ;(async () => {
        try {
          const res = await fetch("/api/auth/telegram", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              initData,
              startParam: getStartParamFromLocation(),
            }),
            signal: controller?.signal,
          })

          const jsonUnknown: unknown = await res.json()
          const json = jsonUnknown as TelegramAuthResponse
          if (!res.ok || !json?.ok) {
            authAttempts += 1
            const apiError = (json as { error?: string })?.error
            const error = apiError || (!res.ok ? `HTTP_${res.status}` : "AUTH_FAILED")
            if (authAttempts < maxAuthAttempts && !cancelled) {
              setTimeout(init, retryDelayMs)
              return
            }
            if (!cancelled) {
              setState({ status: "error", error: `AUTH_FAILED_AFTER_${maxAuthAttempts}:${error}` })
            }
            return
          }

          if (!cancelled) setState({ status: "ready", user: json.user, dbUser: json.dbUser, wallets: json.wallets })
        } catch (e: unknown) {
          if (e && typeof e === "object" && "name" in e && (e as { name?: string }).name === "AbortError") return
          if (!cancelled) setState({ status: "error", error: "NETWORK_ERROR" })
        }
      })()
    }

    init()

    return () => {
      cancelled = true
      controller?.abort()
    }
  }, [])

  return { state }
}
