"use client"

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

export type AppLocale = "ru" | "en"

export interface AppSettings {
  locale: AppLocale
  hapticsEnabled: boolean
  setLocale: (locale: AppLocale) => void
  setHapticsEnabled: (enabled: boolean) => void
}

const LOCALE_STORAGE_KEY = "starrush:locale"
const HAPTICS_STORAGE_KEY = "starrush:haptics"

const AppSettingsContext = createContext<AppSettings | null>(null)

function parseLocale(raw: string | null): AppLocale | null {
  if (raw === "ru" || raw === "en") return raw
  return null
}

function parseHapticsEnabled(raw: string | null): boolean | null {
  if (raw === "true") return true
  if (raw === "false") return false
  return null
}

export function resolveLocaleFromTelegram(languageCode?: string | null): AppLocale {
  if (typeof languageCode !== "string") return "ru"
  return languageCode.trim().toLowerCase().startsWith("en") ? "en" : "ru"
}

interface AppSettingsProviderProps {
  telegramLanguageCode?: string | null
  children: ReactNode
}

export function AppSettingsProvider({
  telegramLanguageCode,
  children,
}: AppSettingsProviderProps) {
  const [locale, setLocale] = useState<AppLocale>("ru")
  const [hapticsEnabled, setHapticsEnabled] = useState(true)
  const [resolved, setResolved] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return

    const storedLocale = parseLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY))
    const storedHaptics = parseHapticsEnabled(window.localStorage.getItem(HAPTICS_STORAGE_KEY))

    setLocale(storedLocale ?? resolveLocaleFromTelegram(telegramLanguageCode))
    setHapticsEnabled(storedHaptics ?? true)
    setResolved(true)
  }, [telegramLanguageCode])

  useEffect(() => {
    if (typeof document === "undefined") return
    document.documentElement.lang = locale
  }, [locale])

  useEffect(() => {
    if (!resolved || typeof window === "undefined") return
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  }, [locale, resolved])

  useEffect(() => {
    if (!resolved || typeof window === "undefined") return
    window.localStorage.setItem(HAPTICS_STORAGE_KEY, String(hapticsEnabled))
  }, [hapticsEnabled, resolved])

  const value = useMemo<AppSettings>(
    () => ({
      locale,
      hapticsEnabled,
      setLocale,
      setHapticsEnabled,
    }),
    [hapticsEnabled, locale],
  )

  return <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>
}

export function useAppSettings() {
  const context = useContext(AppSettingsContext)
  if (!context) {
    throw new Error("useAppSettings must be used inside AppSettingsProvider")
  }
  return context
}
