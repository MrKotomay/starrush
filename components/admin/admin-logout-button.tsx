"use client"

import { useTransition } from "react"
import { useAdminCsrfToken } from "@/components/admin/admin-csrf-provider"

export function AdminLogoutButton() {
  const csrfToken = useAdminCsrfToken()
  const [isPending, startTransition] = useTransition()

  return (
    <button
      type="button"
      className="rounded-full border border-border/70 px-4 py-2 text-sm font-medium text-foreground transition hover:border-primary/40 hover:bg-primary/10"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          await fetch("/api/admin/logout", {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
              "x-csrf-token": csrfToken,
            },
            body: "{}",
          }).catch(() => null)

          window.location.href = "/admin/login"
        })
      }}
    >
      {isPending ? "Signing out..." : "Sign out"}
    </button>
  )
}
