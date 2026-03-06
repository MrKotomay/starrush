"use client"

import { motion } from "framer-motion"
import { QrCode, Settings } from "lucide-react"

import { useI18n } from "@/lib/i18n"

interface ProfileHeaderProps {
  username: string
  bio: string
  avatarUrl?: string
  avatarLayoutId?: string
}

const ICON_BTN =
  "glass-pill focus-brand liquid-sheen inline-flex h-11 w-11 items-center justify-center rounded-full px-0 py-0 text-muted-foreground transition-colors duration-150 hover:text-foreground active:scale-95" as const

export function ProfileHeader({
  username,
  bio,
  avatarUrl,
  avatarLayoutId = "shared-profile-avatar",
}: ProfileHeaderProps) {
  const { t } = useI18n()

  return (
    <div className="flex flex-col items-center pb-7 pt-1">
      {/* Icon row */}
      <div className="mb-7 flex w-full items-center justify-between px-[var(--page-px)]">
        <button
          className={ICON_BTN}
          data-sheen="event"
          aria-label={t("profileHeader.settings")}
          type="button"
        >
          <Settings className="h-5 w-5" />
        </button>
        <button
          className={ICON_BTN}
          data-sheen="event"
          aria-label={t("profileHeader.qr")}
          type="button"
        >
          <QrCode className="h-5 w-5" />
        </button>
      </div>

      {/* Avatar */}
      <div className="relative mb-5">
        <motion.div
          layoutId={avatarLayoutId}
          transition={{ type: "spring", stiffness: 320, damping: 30, mass: 0.75 }}
          className="h-[120px] w-[120px] rounded-full p-[3px]"
          style={{
            backgroundImage: "var(--primary-gradient)",
            boxShadow: "0 14px 30px rgba(107, 75, 255, 0.2), var(--shadow-sm)",
          }}
        >
          <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-surface-1">
            {avatarUrl ? (
              <img
                src={avatarUrl || "/placeholder.svg"}
                alt={t("profileHeader.avatarAlt", { username })}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand-1/36 to-brand-2/24">
                <span className="type-title text-foreground">
                  {username.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      <h1 className="mb-1 text-[2rem] font-semibold tracking-[-0.05em] text-foreground">{username}</h1>
      <p className="type-caption max-w-[240px] text-center text-muted-foreground">{bio}</p>
    </div>
  )
}
