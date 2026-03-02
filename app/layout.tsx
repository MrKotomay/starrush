import React from "react"
import Script from "next/script"
import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { appColorCssVariables, colors } from "@/theme/colors"
import { TonConnectProvider } from "@/components/providers/tonconnect-provider"
import './globals.css'

const inter = Inter({ subsets: ["latin", "cyrillic"] });
const ENABLE_VERCEL_ANALYTICS = process.env.NEXT_PUBLIC_ENABLE_VERCEL_ANALYTICS === "1"

export const metadata: Metadata = {
  title: 'StarRush - Telegram Mini App',
  description: 'Crypto mining and staking platform',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/ton.png',
        type: 'image/png',
      },
      {
        url: '/ton.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/ton.png',
  },
}

export const viewport: Viewport = {
  themeColor: colors.surfaceAlt,
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="ru"
      suppressHydrationWarning
      style={appColorCssVariables as React.CSSProperties}
    >
      <head>
        <meta charSet="UTF-8" />
      </head>
      <body className={`${inter.className} antialiased`}>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        <TonConnectProvider>{children}</TonConnectProvider>
        {ENABLE_VERCEL_ANALYTICS ? <Analytics /> : null}
      </body>
    </html>
  )
}
