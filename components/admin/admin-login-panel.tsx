"use client"

import { useEffect, useState, useTransition } from "react"

type TelegramLoginResult = {
  id_token?: string
  error?: string
  user?: {
    id?: number | string
    sub?: string
    name?: string
    preferred_username?: string
    picture?: string
  }
}

type TelegramLoginApi = {
  init: (
    options: {
      client_id: number
      request_access?: Array<"write" | "phone">
      lang?: string
      nonce?: string
    },
    callback: (result: TelegramLoginResult) => void,
  ) => void
  open: (callback?: (result: TelegramLoginResult) => void) => void
}

declare global {
  interface Window {
    Telegram?: {
      Login?: TelegramLoginApi
    }
    __telegramLoginScriptPromise?: Promise<void>
  }
}

function loadTelegramLoginScript() {
  if (window.Telegram?.Login) {
    return Promise.resolve()
  }

  if (!window.__telegramLoginScriptPromise) {
    window.__telegramLoginScriptPromise = new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>('script[src="https://oauth.telegram.org/js/telegram-login.js?3"]')
      if (existing) {
        if (window.Telegram?.Login) {
          resolve()
          return
        }
        existing.addEventListener("load", () => resolve(), { once: true })
        existing.addEventListener("error", () => reject(new Error("SCRIPT_LOAD_FAILED")), { once: true })
        return
      }

      const script = document.createElement("script")
      script.async = true
      script.src = "https://oauth.telegram.org/js/telegram-login.js?3"
      script.onload = () => resolve()
      script.onerror = () => reject(new Error("SCRIPT_LOAD_FAILED"))
      document.head.appendChild(script)
    })
  }

  return window.__telegramLoginScriptPromise
}

export function AdminLoginPanel({
  clientId,
  initialError,
}: {
  clientId: string
  initialError?: string | null
}) {
  const [nonce, setNonce] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(initialError ?? null)
  const [isReady, setIsReady] = useState(false)
  const [isPending, startTransition] = useTransition()
  const numericClientId = Number(clientId)
  const parsedClientId = Number.isInteger(numericClientId) && numericClientId > 0 ? numericClientId : null

  useEffect(() => {
    let cancelled = false

    void fetch("/api/admin/auth/nonce", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as { nonce?: string; error?: string } | null
        if (cancelled) return

        if (!response.ok || !payload?.nonce) {
          setError(payload?.error ?? "Unable to initialize secure admin login.")
          return
        }

        setNonce(payload.nonce)
      })
      .catch(() => {
        if (cancelled) return
        setError("Unable to initialize secure admin login.")
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!nonce || !parsedClientId) return

    let cancelled = false
    setIsReady(false)

    void loadTelegramLoginScript()
      .then(() => {
        if (cancelled) return

        const loginApi = window.Telegram?.Login
        if (!loginApi) {
          setError("Telegram login SDK is unavailable.")
          return
        }

        loginApi.init(
          {
            client_id: parsedClientId,
            request_access: ["write"],
            lang: "en",
            nonce,
          },
          (result) => {
            if (cancelled) return
            if (result.error) {
              setError(result.error)
              return
            }
            if (!result.id_token) {
              setError("Telegram did not return an ID token.")
              return
            }

            startTransition(async () => {
              setError(null)

              const response = await fetch("/api/admin/auth/telegram", {
                method: "POST",
                credentials: "include",
                headers: {
                  Accept: "application/json",
                  "Content-Type": "application/json",
                  "x-admin-login-nonce": nonce,
                },
                body: JSON.stringify({ id_token: result.id_token }),
              }).catch(() => null)

              if (!response) {
                setError("Network is unavailable. Please try again.")
                return
              }

              const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null
              if (!response.ok || payload?.ok !== true) {
                setError(payload?.error ?? "Admin login was rejected.")
                return
              }

              window.location.href = "/admin"
            })
          },
        )

        setIsReady(true)
      })
      .catch(() => {
        if (cancelled) return
        setError("Telegram login SDK failed to load.")
      })

    return () => {
      cancelled = true
    }
  }, [nonce, parsedClientId, startTransition])

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl items-center px-6 py-12">
      <div className="grid w-full gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-[2rem] border border-border/60 bg-card/80 p-8 shadow-[0_40px_120px_rgba(0,0,0,0.18)] backdrop-blur">
          <div className="inline-flex rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-primary">
            StarRush Control Room
          </div>
          <h1 className="mt-6 max-w-2xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Browser admin panel for gameplay, payments, monitoring, and safe operations.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
            The admin UI runs inside the current Next.js app, uses server-side PostgreSQL and Redis access, and stays
            isolated from the public game shell with a separate security flow.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <div className="rounded-3xl border border-border/60 bg-background/80 p-4">
              <div className="text-sm font-medium text-foreground">Monitoring</div>
              <p className="mt-2 text-sm text-muted-foreground">Live health, online count, round flow, deposits, and bankroll state.</p>
            </div>
            <div className="rounded-3xl border border-border/60 bg-background/80 p-4">
              <div className="text-sm font-medium text-foreground">Manual actions</div>
              <p className="mt-2 text-sm text-muted-foreground">Audited wallet and treasury adjustments through domain-safe endpoints.</p>
            </div>
            <div className="rounded-3xl border border-border/60 bg-background/80 p-4">
              <div className="text-sm font-medium text-foreground">Data</div>
              <p className="mt-2 text-sm text-muted-foreground">Embedded Prisma Studio plus business events and admin audit history.</p>
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-border/60 bg-card/85 p-8 shadow-[0_40px_120px_rgba(0,0,0,0.2)] backdrop-blur">
          <h2 className="text-2xl font-semibold text-foreground">Administrator sign-in</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            After Caddy basic auth, access is confirmed with Telegram Login OIDC. Only Telegram IDs from the admin
            allowlist can continue.
          </p>

          {!parsedClientId ? (
            <div className="mt-6 rounded-2xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              `TELEGRAM_LOGIN_CLIENT_ID` is not configured.
            </div>
          ) : null}

          <button
            type="button"
            disabled={!parsedClientId || !nonce || !isReady || isPending}
            onClick={() => window.Telegram?.Login?.open()}
            className="mt-8 inline-flex w-full items-center justify-center rounded-2xl bg-primary px-5 py-4 text-sm font-semibold text-primary-foreground transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Verifying Telegram session..." : "Sign in with Telegram"}
          </button>

          {!isPending && nonce && isReady ? (
            <div className="mt-4 text-sm text-muted-foreground">Telegram login is ready.</div>
          ) : null}

          {error ? (
            <div className="mt-5 rounded-2xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          <div className="mt-8 rounded-2xl border border-border/60 bg-background/75 px-4 py-4 text-sm text-muted-foreground">
            <div className="font-medium text-foreground">Requirements</div>
            <ul className="mt-3 space-y-2">
              <li>Your Telegram ID must be present in `ADMIN_TELEGRAM_IDS`.</li>
              <li>Your website origin must be registered in BotFather Web Login settings.</li>
              <li>Write APIs require the extra admin CSRF token after login.</li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  )
}
