import { AdminTreasuryAdjustmentForm } from "@/components/admin/admin-treasury-adjustment-form"
import { getAdminDashboardData } from "@/lib/admin-data"

function HealthBadge({ payload }: { payload: { ok?: boolean; status?: string } | null | undefined }) {
  const ok = payload?.ok === true || payload?.status === "ready"
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${ok ? "bg-emerald-500/15 text-emerald-200" : "bg-amber-500/15 text-amber-200"}`}>
      {ok ? "ready" : payload?.status ?? "offline"}
    </span>
  )
}

export default async function AdminDashboardPage() {
  const data = await getAdminDashboardData()

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-border/60 bg-card/85 p-6 shadow-[0_30px_100px_rgba(0,0,0,0.16)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Operations</div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">StarRush admin dashboard</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              A single overview for player activity, round engine state, deposits, and internal services.
            </p>
          </div>
          <div className="rounded-3xl border border-border/60 bg-background/80 px-4 py-3 text-sm text-muted-foreground">
            Active round:{" "}
            <span className="font-medium text-foreground">
              {data.rounds.active ? `${data.rounds.active.id} (${data.rounds.active.status})` : "none"}
            </span>
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-3xl border border-border/60 bg-background/75 p-5">
            <div className="text-sm text-muted-foreground">Users</div>
            <div className="mt-2 text-3xl font-semibold text-foreground">{data.users.total}</div>
            <div className="mt-2 text-sm text-muted-foreground">+{data.users.last24h} in the last 24h</div>
          </div>
          <div className="rounded-3xl border border-border/60 bg-background/75 p-5">
            <div className="text-sm text-muted-foreground">Rounds</div>
            <div className="mt-2 text-3xl font-semibold text-foreground">{data.rounds.total}</div>
            <div className="mt-2 text-sm text-muted-foreground">{data.rounds.last24h} created in 24h</div>
          </div>
          <div className="rounded-3xl border border-border/60 bg-background/75 p-5">
            <div className="text-sm text-muted-foreground">Bet Volume 24h</div>
            <div className="mt-2 text-3xl font-semibold text-foreground">{data.gameplay.betVolume24h}</div>
            <div className="mt-2 text-sm text-muted-foreground">{data.gameplay.betCount24h} bets</div>
          </div>
          <div className="rounded-3xl border border-border/60 bg-background/75 p-5">
            <div className="text-sm text-muted-foreground">Deposits 24h</div>
            <div className="mt-2 text-3xl font-semibold text-foreground">{data.deposits.completedAmount24h}</div>
            <div className="mt-2 text-sm text-muted-foreground">{data.deposits.completedCount24h} completed, {data.deposits.pendingCount} pending</div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <div className="rounded-[2rem] border border-border/60 bg-card/85 p-6 shadow-[0_30px_100px_rgba(0,0,0,0.16)]">
          <h2 className="text-xl font-semibold text-foreground">Service health</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-border/60 bg-background/75 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">App</span>
                <HealthBadge payload={data.health.app as { ok?: boolean; status?: string } | null} />
              </div>
              <pre className="mt-4 overflow-x-auto text-xs text-muted-foreground">{JSON.stringify(data.health.app, null, 2)}</pre>
            </div>
            <div className="rounded-3xl border border-border/60 bg-background/75 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Gateway</span>
                <HealthBadge payload={data.health.gateway as { ok?: boolean; status?: string } | null} />
              </div>
              <pre className="mt-4 overflow-x-auto text-xs text-muted-foreground">{JSON.stringify(data.health.gateway, null, 2)}</pre>
            </div>
            <div className="rounded-3xl border border-border/60 bg-background/75 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Worker</span>
                <HealthBadge payload={data.health.worker as { ok?: boolean; status?: string } | null} />
              </div>
              <pre className="mt-4 overflow-x-auto text-xs text-muted-foreground">{JSON.stringify(data.health.worker, null, 2)}</pre>
            </div>
            <div className="rounded-3xl border border-border/60 bg-background/75 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Gateway live stats</span>
                <HealthBadge payload={{ ok: true, status: "ready" }} />
              </div>
              <pre className="mt-4 overflow-x-auto text-xs text-muted-foreground">{JSON.stringify(data.health.gatewayStats, null, 2)}</pre>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <section className="rounded-[2rem] border border-border/60 bg-card/85 p-6 shadow-[0_30px_100px_rgba(0,0,0,0.16)]">
            <h2 className="text-xl font-semibold text-foreground">House wallets</h2>
            <div className="mt-5 space-y-3">
              {data.houseWallets.map((wallet) => (
                <div key={wallet.id} className="rounded-3xl border border-border/60 bg-background/75 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-foreground">{wallet.currency}</div>
                      <div className="mt-1 text-2xl font-semibold text-foreground">{wallet.balance}</div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Updated {new Date(wallet.updatedAt).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[2rem] border border-border/60 bg-card/85 p-6 shadow-[0_30px_100px_rgba(0,0,0,0.16)]">
            <h2 className="text-xl font-semibold text-foreground">Treasury adjustments</h2>
            <div className="mt-5 space-y-4">
              <AdminTreasuryAdjustmentForm currency="TON" />
              <AdminTreasuryAdjustmentForm currency="STARS" />
            </div>
          </section>
        </div>
      </section>
    </div>
  )
}
