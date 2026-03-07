"use client"

import dynamic from "next/dynamic"
import { AppSettingsProvider } from "@/lib/app-settings"
import { useI18n } from "@/lib/i18n"

function CrashLoadingFallback() {
  const { t } = useI18n()

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground/70">{t("common.loading")}</p>
      </div>
    </div>
  )
}

const CrashGame = dynamic(
  () => import("@/components/crash/CrashGame").then((mod) => mod.CrashGame),
  {
    ssr: false,
    loading: () => <CrashLoadingFallback />,
  },
)

function CrashPageContent() {
  return (
    <div className="min-h-screen bg-background">
      <CrashGame demoMode={true} />
    </div>
  )
}

export default function CrashPage() {
  return (
    <AppSettingsProvider>
      <CrashPageContent />
    </AppSettingsProvider>
  )
}
