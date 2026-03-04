"use client"

import { useEffect, useState } from "react"

const MOBILE_OVERLAY_MEDIA_QUERY = "(max-width: 767px), (hover: none) and (pointer: coarse)"

export function useAdaptiveOverlayMotion() {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return

    const mediaQuery = window.matchMedia(MOBILE_OVERLAY_MEDIA_QUERY)
    const sync = () => setEnabled(mediaQuery.matches)
    sync()
    mediaQuery.addEventListener("change", sync)
    return () => mediaQuery.removeEventListener("change", sync)
  }, [])

  return enabled
}
