"use client"

import { motion, useReducedMotion } from "framer-motion"
import { Rocket } from "lucide-react"

import { ParticleBackground } from "@/components/particle-background"

interface AppBootstrapSplashProps {
  progress: number
  label: string
}

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

export function AppBootstrapSplash({ progress, label }: AppBootstrapSplashProps) {
  const shouldReduceMotion = useReducedMotion()
  const normalized = clampProgress(progress)
  const percent = Math.round(normalized * 100)
  const fill = `${Math.max(6, percent)}%`
  const barTransition = shouldReduceMotion
    ? { duration: 0.1 }
    : { duration: 0.32, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background bg-cosmic-radial">
      <ParticleBackground />

      <div className="relative z-10 flex min-h-screen items-center justify-center px-6 py-8">
        <div className="w-full max-w-sm rounded-3xl border border-white/12 bg-[hsl(var(--surface-1)/0.46)] p-6 shadow-[0_20px_56px_rgba(4,7,22,0.52)] backdrop-blur-[14px]">
          <motion.div
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-brand-1 to-brand-2 shadow-[0_10px_26px_rgba(101,29,203,0.42)]"
            animate={shouldReduceMotion ? undefined : { y: [0, -2, 0] }}
            transition={shouldReduceMotion ? undefined : { duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          >
            <Rocket className="h-7 w-7 text-foreground" />
          </motion.div>

          <p className="text-center text-base font-semibold text-foreground">Запуск StarRush</p>
          <p className="mt-1 text-center text-xs text-muted-foreground">{label}</p>

          <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-white/10">
            <motion.span
              className="block h-full rounded-full bg-gradient-to-r from-brand-1 via-brand-2 to-brand-1"
              initial={{ width: "6%" }}
              animate={{ width: fill }}
              transition={barTransition}
            />
          </div>

          <p className="mt-2 text-center text-xs font-medium text-muted-foreground">{percent}%</p>
        </div>
      </div>
    </div>
  )
}

