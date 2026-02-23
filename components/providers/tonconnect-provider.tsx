"use client"

import type { ReactNode } from "react"
import { TonConnectUIProvider } from "@tonconnect/ui-react"

const MANIFEST_URL = process.env.NEXT_PUBLIC_TONCONNECT_MANIFEST_URL ?? "/api/tonconnect/manifest"

export function TonConnectProvider({ children }: { children: ReactNode }) {
  return <TonConnectUIProvider manifestUrl={MANIFEST_URL}>{children}</TonConnectUIProvider>
}
