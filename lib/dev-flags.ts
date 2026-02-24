export function parseBooleanEnv(value: string | undefined): boolean | null {
  if (typeof value !== "string") return null
  const normalized = value.trim().toLowerCase()
  if (normalized === "1" || normalized === "true") return true
  if (normalized === "0" || normalized === "false") return false
  return null
}

export function isEnabledByEnvWithDevDefault(envValue: string | undefined): boolean {
  const explicitToggle = parseBooleanEnv(envValue)
  if (explicitToggle !== null) return explicitToggle
  return process.env.NODE_ENV === "development"
}
