"use client"

type WalletCurrency = "TON" | "STARS"

export type BootstrapWallet = {
  id: string
  currency: WalletCurrency
  balance: string
  lockedBalance: string
}

export type BootstrapReferralSummary = {
  invitedCount: number
  earnedTon: string
  earnedStars: string
  commissionRate: string
  referralLink: string
}

export type MiniAppWarmData = {
  wallets?: BootstrapWallet[]
  referralSummary?: BootstrapReferralSummary
}

export type MiniAppBootstrapProgress = {
  value: number
  label: string
}

export type MiniAppBootstrapResult = {
  warmData: MiniAppWarmData
  finishedAt: number
  durationMs: number
}

type BootstrapProgressCallback = (progress: MiniAppBootstrapProgress) => void

type WalletsApiResponse = {
  ok?: boolean
  wallets?: BootstrapWallet[]
}

type ReferralSummaryApiResponse = {
  ok?: boolean
  summary?: BootstrapReferralSummary
}

const PLANET_ASSETS = [
  "/planets/lavaworld.png",
  "/planets/iceworld.png",
  "/planets/terraindry.png",
  "/planets/noatmosphere.png",
] as const

const UI_ASSETS = [
  "/rocket/rocket.json",
  "/ton.svg",
  "/stars.svg",
] as const

let bootPromise: Promise<MiniAppBootstrapResult> | null = null
let bootResult: MiniAppBootstrapResult | null = null
const FETCH_TIMEOUT_MS = 4500

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function pushProgress(
  callback: BootstrapProgressCallback | undefined,
  value: number,
  label: string
) {
  callback?.({ value: clampProgress(value), label })
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    })
    if (!response.ok) return null
    return (await response.json()) as T
  } catch {
    return null
  } finally {
    window.clearTimeout(timeoutId)
  }
}

async function preloadImage(url: string): Promise<void> {
  if (typeof window === "undefined") return
  const img = new Image()
  img.decoding = "async"
  img.loading = "eager"
  img.src = url

  if ("decode" in img) {
    try {
      await img.decode()
      return
    } catch {
      // fallback to onload/onerror path
    }
  }

  await new Promise<void>((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      resolve()
    }
    img.onload = finish
    img.onerror = finish
  })
}

async function preloadModules(): Promise<void> {
  await Promise.all([
    import("@/components/crash/CrashGame"),
    import("@/components/game/StarRushPanel"),
    import("@/game/StarRushGame"),
    import("@/lib/game/backend-round-state-adapter"),
    import("phaser"),
    import("lottie-web"),
  ])
}

async function preloadStaticAssets(): Promise<void> {
  await Promise.all(
    UI_ASSETS.map(async (url) => {
      const controller = new AbortController()
      const timeoutId = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
      try {
        await fetch(url, { cache: "force-cache", signal: controller.signal })
      } catch {
        // ignore non-critical warm-up errors
      } finally {
        window.clearTimeout(timeoutId)
      }
    })
  )

  await Promise.all(
    PLANET_ASSETS.map(async (url) => {
      try {
        await preloadImage(url)
      } catch {
        // ignore non-critical warm-up errors
      }
    })
  )
}

async function warmApiData(): Promise<MiniAppWarmData> {
  const [walletsRaw, referralRaw] = await Promise.all([
    fetchJson<WalletsApiResponse>("/api/wallets"),
    fetchJson<ReferralSummaryApiResponse>("/api/referrals/summary"),
    fetchJson<unknown>("/api/game/round/current"),
  ])

  const warmData: MiniAppWarmData = {}

  if (walletsRaw?.ok === true && Array.isArray(walletsRaw.wallets)) {
    warmData.wallets = walletsRaw.wallets
  }

  if (referralRaw?.ok === true && referralRaw.summary) {
    warmData.referralSummary = referralRaw.summary
  }

  return warmData
}

export async function runMiniAppBootstrap(args?: {
  onProgress?: BootstrapProgressCallback
}): Promise<MiniAppBootstrapResult> {
  const onProgress = args?.onProgress

  if (bootResult) {
    pushProgress(onProgress, 1, "Готово")
    return bootResult
  }

  if (bootPromise) return bootPromise

  bootPromise = (async () => {
    const startedAt = Date.now()
    const weights = {
      modules: 0.44,
      assets: 0.34,
      data: 0.22,
    }
    let progressBase = 0

    pushProgress(onProgress, 0.06, "Подготовка мини-приложения")

    pushProgress(onProgress, progressBase + 0.02, "Загружаем интерфейс и игровой движок")
    try {
      await preloadModules()
    } finally {
      progressBase += weights.modules
      pushProgress(onProgress, progressBase, "Интерфейс и движок готовы")
    }

    pushProgress(onProgress, progressBase + 0.02, "Кэшируем ассеты игры")
    try {
      await preloadStaticAssets()
    } finally {
      progressBase += weights.assets
      pushProgress(onProgress, progressBase, "Ассеты игры готовы")
    }

    pushProgress(onProgress, progressBase + 0.02, "Синхронизируем данные аккаунта")
    let warmData: MiniAppWarmData = {}
    try {
      warmData = await warmApiData()
    } finally {
      progressBase += weights.data
      pushProgress(onProgress, progressBase, "Данные аккаунта синхронизированы")
    }

    const finishedAt = Date.now()
    const result: MiniAppBootstrapResult = {
      warmData,
      finishedAt,
      durationMs: Math.max(0, finishedAt - startedAt),
    }

    bootResult = result
    pushProgress(onProgress, 1, "Запуск приложения")
    return result
  })()

  try {
    return await bootPromise
  } finally {
    bootPromise = null
  }
}
