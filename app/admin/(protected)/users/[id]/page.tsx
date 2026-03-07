import { notFound } from "next/navigation"
import { AdminWalletAdjustmentForm } from "@/components/admin/admin-wallet-adjustment-form"
import { getAdminUserDetail } from "@/lib/admin-data"

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await getAdminUserDetail(id)

  if (!user) {
    notFound()
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-border/60 bg-card/85 p-6 shadow-[0_30px_100px_rgba(0,0,0,0.16)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">User detail</div>
            <h1 className="mt-3 text-3xl font-semibold text-foreground">
              {user.username || `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.id}
            </h1>
            <div className="mt-3 space-y-1 text-sm text-muted-foreground">
              <div>User ID: {user.id}</div>
              <div>Telegram ID: {user.telegramId.toString()}</div>
              <div>Created: {new Date(user.createdAt).toLocaleString()}</div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {user.wallets.map((wallet) => (
              <div key={wallet.id} className="rounded-3xl border border-border/60 bg-background/75 p-4">
                <div className="text-sm font-medium text-foreground">{wallet.currency}</div>
                <div className="mt-2 text-2xl font-semibold text-foreground">{wallet.balance.toString()}</div>
                <div className="mt-1 text-xs text-muted-foreground">Locked: {wallet.lockedBalance.toString()}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-4">
          {user.wallets.map((wallet) => (
            <AdminWalletAdjustmentForm key={wallet.id} currency={wallet.currency} userId={user.id} />
          ))}
        </div>

        <div className="rounded-[2rem] border border-border/60 bg-card/85 p-6 shadow-[0_30px_100px_rgba(0,0,0,0.16)]">
          <h2 className="text-xl font-semibold text-foreground">Ledger</h2>
          <div className="mt-4 max-h-[600px] overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-muted-foreground">
                <tr className="border-b border-border/60">
                  <th className="px-3 py-3 font-medium">Type</th>
                  <th className="px-3 py-3 font-medium">Amount</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {user.ledger.map((entry) => (
                  <tr key={entry.id} className="border-b border-border/40">
                    <td className="px-3 py-3 text-foreground">{entry.type}</td>
                    <td className="px-3 py-3 text-muted-foreground">{entry.amount.toString()} {entry.currency}</td>
                    <td className="px-3 py-3 text-muted-foreground">{entry.status}</td>
                    <td className="px-3 py-3 text-muted-foreground">{new Date(entry.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-[2rem] border border-border/60 bg-card/85 p-6 shadow-[0_30px_100px_rgba(0,0,0,0.16)]">
          <h2 className="text-xl font-semibold text-foreground">Sessions</h2>
          <div className="mt-4 space-y-3">
            {user.sessions.map((session) => (
              <div key={session.id} className="rounded-3xl border border-border/60 bg-background/75 p-4 text-sm text-muted-foreground">
                <div>ID: {session.id}</div>
                <div>Created: {new Date(session.createdAt).toLocaleString()}</div>
                <div>Expires: {new Date(session.expiresAt).toLocaleString()}</div>
                <div>Last seen: {session.lastSeenAt ? new Date(session.lastSeenAt).toLocaleString() : "never"}</div>
                <div>Revoked: {session.revokedAt ? new Date(session.revokedAt).toLocaleString() : "active"}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[2rem] border border-border/60 bg-card/85 p-6 shadow-[0_30px_100px_rgba(0,0,0,0.16)]">
          <h2 className="text-xl font-semibold text-foreground">Deposits & rounds</h2>
          <div className="mt-4 space-y-3 text-sm">
            {user.depositIntents.slice(0, 10).map((intent) => (
              <div key={intent.id} className="rounded-3xl border border-border/60 bg-background/75 p-4 text-muted-foreground">
                <div className="font-medium text-foreground">{intent.provider} / {intent.status}</div>
                <div className="mt-1">Amount: {intent.amount.toString()} {intent.currency}</div>
                <div>Created: {new Date(intent.createdAt).toLocaleString()}</div>
              </div>
            ))}
            {user.roundPlayers.slice(0, 10).map((player) => (
              <div key={player.id} className="rounded-3xl border border-border/60 bg-background/75 p-4 text-muted-foreground">
                <div className="font-medium text-foreground">Round {player.roundId}</div>
                <div className="mt-1">Bet: {player.betAmount.toString()} {player.currency}</div>
                <div>Status: {player.status}</div>
                <div>Round status: {player.round.status}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
