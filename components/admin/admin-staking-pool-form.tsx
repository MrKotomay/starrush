"use client"

import { useState, useTransition } from "react"

import { useAdminCsrfToken } from "@/components/admin/admin-csrf-provider"

type AdminStakingPoolFormProps = {
  pool: {
    assetId: string
    symbol: string
    enabled: boolean
    aprBps: number
    minStake: string
    unstakeCooldownHours: number
    rewardReserve: string
    totalStaked: string
    positionCount: number
    pendingUnstakeCount: number
  }
}

export function AdminStakingPoolForm({ pool }: AdminStakingPoolFormProps) {
  const csrfToken = useAdminCsrfToken()
  const [enabled, setEnabled] = useState(pool.enabled)
  const [aprBps, setAprBps] = useState(String(pool.aprBps))
  const [minStake, setMinStake] = useState(pool.minStake)
  const [unstakeCooldownHours, setUnstakeCooldownHours] = useState(String(pool.unstakeCooldownHours))
  const [rewardReserveDelta, setRewardReserveDelta] = useState("0")
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  return (
    <form
      className="space-y-4 rounded-3xl border border-border/60 bg-background/80 p-4"
      onSubmit={(event) => {
        event.preventDefault()
        startTransition(async () => {
          setMessage(null)

          const response = await fetch(`/api/admin/staking/pools/${pool.assetId}`, {
            method: "POST",
            credentials: "include",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              "x-csrf-token": csrfToken,
            },
            body: JSON.stringify({
              enabled,
              aprBps,
              minStake,
              unstakeCooldownHours,
              rewardReserveDelta,
              requestId: crypto.randomUUID(),
            }),
          }).catch(() => null)

          if (!response) {
            setMessage("Network is unavailable.")
            return
          }

          const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null
          if (!response.ok || payload?.ok !== true) {
            setMessage(payload?.error ?? "The pool update was not applied.")
            return
          }

          setRewardReserveDelta("0")
          setMessage("Pool updated.")
          window.location.reload()
        })
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-foreground">{pool.assetId} staking pool</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Reserve {pool.rewardReserve}, staked {pool.totalStaked}, positions {pool.positionCount}, pending unstakes {pool.pendingUnstakeCount}
          </div>
        </div>
        <label className="flex items-center gap-2 rounded-full border border-border/60 bg-card px-3 py-2 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          Enabled
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <input
          className="w-full rounded-2xl border border-border/60 bg-card px-4 py-3 text-sm"
          placeholder="APR (bps)"
          required
          value={aprBps}
          onChange={(event) => setAprBps(event.target.value)}
        />
        <input
          className="w-full rounded-2xl border border-border/60 bg-card px-4 py-3 text-sm"
          placeholder="Min stake"
          required
          value={minStake}
          onChange={(event) => setMinStake(event.target.value)}
        />
        <input
          className="w-full rounded-2xl border border-border/60 bg-card px-4 py-3 text-sm"
          placeholder="Cooldown hours"
          required
          value={unstakeCooldownHours}
          onChange={(event) => setUnstakeCooldownHours(event.target.value)}
        />
        <input
          className="w-full rounded-2xl border border-border/60 bg-card px-4 py-3 text-sm"
          placeholder="Reward reserve delta"
          required
          value={rewardReserveDelta}
          onChange={(event) => setRewardReserveDelta(event.target.value)}
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:brightness-105 disabled:opacity-60"
      >
        {isPending ? "Applying..." : `Update ${pool.symbol}`}
      </button>

      {message ? <div className="text-sm text-muted-foreground">{message}</div> : null}
    </form>
  )
}
