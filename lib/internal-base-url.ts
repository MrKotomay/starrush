const DEFAULT_INTERNAL_APP_BASE_URL = "http://app:3000"

export function getInternalAppBaseUrl() {
  return process.env.APP_INTERNAL_BASE_URL?.trim() || DEFAULT_INTERNAL_APP_BASE_URL
}
