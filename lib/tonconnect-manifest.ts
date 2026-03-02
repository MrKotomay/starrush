const DEFAULT_ICON_PATH = "/ton.png"

function getEnvPublicAppUrl() {
  const candidates = [
    process.env.APP_BASE_URL?.trim(),
    process.env.NEXT_PUBLIC_APP_BASE_URL?.trim(),
  ]

  for (const value of candidates) {
    if (!value) continue

    try {
      return new URL(value).origin
    } catch {
      continue
    }
  }

  return null
}

function getForwardedOrigin(req: Request) {
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim()
  const host = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim()
  if (!proto || !host) return null
  return `${proto}://${host}`
}

export function getTonConnectManifestOrigin(req: Request) {
  return getEnvPublicAppUrl() ?? getForwardedOrigin(req) ?? new URL(req.url).origin
}

export function buildTonConnectManifest(req: Request) {
  const origin = getTonConnectManifestOrigin(req)

  return {
    url: origin,
    name: "StarRush",
    iconUrl: `${origin}${DEFAULT_ICON_PATH}`,
    termsOfUseUrl: origin,
    privacyPolicyUrl: origin,
  }
}
