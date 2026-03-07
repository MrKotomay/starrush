import React from "react"
import type { Metadata, Viewport } from "next"
import { Manrope } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { appColorCssVariables, colors } from "@/theme/colors"
import "./globals.css"

const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
  variable: "--font-manrope",
  display: "swap",
})
const ENABLE_VERCEL_ANALYTICS = process.env.NEXT_PUBLIC_ENABLE_VERCEL_ANALYTICS === "1"

export const metadata: Metadata = {
  title: {
    default: "StarRush",
    template: "%s | StarRush",
  },
  description: "StarRush game and operations console",
  generator: "v0.app",
}

export const viewport: Viewport = {
  themeColor: colors.surfaceAlt,
  width: "device-width",
  initialScale: 1,
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
      <body className={`${manrope.variable} ${manrope.className} antialiased`}>
        {children}
        {ENABLE_VERCEL_ANALYTICS ? <Analytics /> : null}
      </body>
    </html>
  )
}
