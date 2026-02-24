"use client"

import { motion } from "framer-motion"
import { QrCode, Settings } from "lucide-react"

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
  return (
    <div className="flex flex-col items-center pb-6 pt-0">
      {/* Icon row */}
      <div className="mb-6 flex w-full items-center justify-between px-[var(--page-px)]">
        <button
          className={ICON_BTN}
          data-sheen="event"
          aria-label="Settings"
          type="button"
        >
          <Settings className="h-5 w-5" />
        </button>
        <button
          className={ICON_BTN}
          data-sheen="event"
          aria-label="QR Code"
          type="button"
        >
          <QrCode className="h-5 w-5" />
        </button>
      </div>

      {/* Avatar */}
      <div className="relative mb-4">
        <motion.div
          layoutId={avatarLayoutId}
          transition={{ type: "spring", stiffness: 320, damping: 30, mass: 0.75 }}
          className="h-28 w-28 rounded-full p-[3px]"
          style={{
            backgroundImage: "var(--primary-gradient)",
            boxShadow: "var(--glow-primary), var(--shadow-sm)",
          }}
        >
          <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-surface-1">
            {avatarUrl ? (
              <img
                src={avatarUrl || "/placeholder.svg"}
                alt={`${username}'s avatar`}
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

      <h1 className="type-title mb-0.5 text-foreground">{username}</h1>
      <p className="type-caption text-muted-foreground">{bio}</p>
    </div>
  )
}
