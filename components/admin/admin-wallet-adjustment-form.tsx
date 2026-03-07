"use client"

import { useState, useTransition } from "react"
import { useAdminCsrfToken } from "@/components/admin/admin-csrf-provider"

export function AdminWalletAdjustmentForm({
  currency,
  userId,
}: {
  currency: "TON" | "STARS"
  userId: string
}) {
  const csrfToken = useAdminCsrfToken()
  const [direction, setDirection] = useState<"credit" | "debit">("credit")
  const [amount, setAmount] = useState("")
  const [reason, setReason] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  return (
    <form
      className="space-y-3 rounded-3xl border border-border/60 bg-background/80 p-4"
      onSubmit={(event) => {
        event.preventDefault()
        startTransition(async () => {
          setMessage(null)
          const requestId = crypto.randomUUID()
          const response = await fetch("/api/admin/wallet-adjustments", {
            method: "POST",
            credentials: "include",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              "x-csrf-token": csrfToken,
            },
            body: JSON.stringify({
              userId,
              currency,
              direction,
              amount,
              reason,
              requestId,
            }),
          }).catch(() => null)

          if (!response) {
            setMessage("Network is unavailable.")
            return
          }

          const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null
          if (!response.ok || payload?.ok !== true) {
            setMessage(payload?.error ?? "The operation was not applied.")
            return
          }

          setAmount("")
          setReason("")
          setMessage("Wallet adjustment applied.")
          window.location.reload()
        })
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-foreground">{currency} adjustment</div>
          <div className="text-xs text-muted-foreground">Mirrored into the house ledger.</div>
        </div>
        <select
          className="rounded-full border border-border/60 bg-card px-3 py-2 text-sm"
          value={direction}
          onChange={(event) => setDirection(event.target.value as "credit" | "debit")}
        >
          <option value="credit">Credit user</option>
          <option value="debit">Debit user</option>
        </select>
      </div>

      <input
        className="w-full rounded-2xl border border-border/60 bg-card px-4 py-3 text-sm"
        placeholder="Amount"
        required
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
      />
      <textarea
        className="min-h-24 w-full rounded-2xl border border-border/60 bg-card px-4 py-3 text-sm"
        placeholder="Reason"
        required
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:brightness-105 disabled:opacity-60"
      >
        {isPending ? "Applying..." : "Apply adjustment"}
      </button>

      {message ? <div className="text-sm text-muted-foreground">{message}</div> : null}
    </form>
  )
}
