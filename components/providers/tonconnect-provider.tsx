"use client"

import type { ReactNode } from "react"
import TonConnect from "@tonconnect/sdk"
import { TonConnectUIProvider } from "@tonconnect/ui-react"

const MANIFEST_URL = process.env.NEXT_PUBLIC_TONCONNECT_MANIFEST_URL ?? "/tonconnect-manifest.json"
const WALLETS_LIST_URL = process.env.NEXT_PUBLIC_TONCONNECT_WALLETS_LIST_URL ?? "/api/tonconnect/wallets-v2"

let connector: TonConnect | null = null

function toAbsoluteClientUrl(value: string): string {
  if (/^https?:\/\//i.test(value)) return value
  if (typeof window === "undefined") return value
  return new URL(value, window.location.origin).toString()
}

function getConnector() {
  if (connector) return connector
  connector = new TonConnect({
    manifestUrl: toAbsoluteClientUrl(MANIFEST_URL),
    walletsListSource: toAbsoluteClientUrl(WALLETS_LIST_URL),
  })
  return connector
}

export function TonConnectProvider({ children }: { children: ReactNode }) {
  if (typeof window === "undefined") {
    return <TonConnectUIProvider manifestUrl={MANIFEST_URL}>{children}</TonConnectUIProvider>
  }

  return <TonConnectUIProvider connector={getConnector()}>{children}</TonConnectUIProvider>
}
