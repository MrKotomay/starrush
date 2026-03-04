"use client"

import { AppSettingsProvider } from "@/lib/app-settings"
import { useI18n } from "@/lib/i18n"

function RushPageContent() {
  const { t } = useI18n()

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card/70 p-8 text-center backdrop-blur-sm">
        <h1 className="mb-3 text-2xl font-bold text-foreground">{t("common.rush")}</h1>
        <p className="text-sm text-muted-foreground">Phaser game integration coming soon...</p>
      </div>
    </div>
  )
}

export default function RushPage() {
  return (
    <AppSettingsProvider>
      <RushPageContent />
    </AppSettingsProvider>
  )
}
