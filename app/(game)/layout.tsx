import type { Metadata, Viewport } from "next"
import Script from "next/script"
import { TonConnectProvider } from "@/components/providers/tonconnect-provider"
import { TelegramShellTheme } from "@/components/telegram-shell-theme"
import { colors } from "@/theme/colors"

export const metadata: Metadata = {
  title: "StarRush - Telegram Mini App",
  description: "Crypto mining and staking platform",
  icons: {
    icon: [
      {
        url: "/ton.png",
        type: "image/png",
      },
      {
        url: "/ton.svg",
        type: "image/svg+xml",
      },
    ],
    apple: "/ton.png",
  },
}

export const viewport: Viewport = {
  themeColor: colors.surfaceAlt,
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function GameLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      <TelegramShellTheme />
      <TonConnectProvider>{children}</TonConnectProvider>
    </>
  )
}
