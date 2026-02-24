"use client"

import { motion } from "framer-motion"
import { QrCode, Settings } from "lucide-react"

interface ProfileHeaderProps {
  username: string
  bio: string
  avatarUrl?: string
  avatarLayoutId?: string
}

export function ProfileHeader({
  username,
  bio,
  avatarUrl,
  avatarLayoutId = "shared-profile-avatar",
}: ProfileHeaderProps) {
  return (
    <div className="flex flex-col items-center pb-6 pt-0">
      <div className="mb-6 flex w-full items-center justify-between px-4">
        <button
          className="btn-secondary focus-brand liquid-sheen inline-flex h-11 w-11 items-center justify-center rounded-full border-white/14 bg-surface-2/88 px-0 py-0 text-muted-foreground hover:text-foreground"
          data-sheen="event"
          aria-label="Settings"
          type="button"
        >
          <Settings className="h-5 w-5" />
        </button>
        <button
          className="btn-secondary focus-brand liquid-sheen inline-flex h-11 w-11 items-center justify-center rounded-full border-white/14 bg-surface-2/88 px-0 py-0 text-muted-foreground hover:text-foreground"
          data-sheen="event"
          aria-label="QR Code"
          type="button"
        >
          <QrCode className="h-5 w-5" />
        </button>
      </div>

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
                <span className="text-3xl font-bold text-foreground">
                  {username.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      <h1 className="mb-1 text-xl font-bold text-foreground">{username}</h1>
      <p className="text-sm text-muted-foreground">{bio}</p>
    </div>
  )
}
