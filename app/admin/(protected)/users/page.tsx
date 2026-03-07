import Link from "next/link"
import { listAdminUsers } from "@/lib/admin-data"

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const params = await searchParams
  const users = await listAdminUsers({ query: params.q, limit: 80 })

  return (
    <div className="rounded-[2rem] border border-border/60 bg-card/85 p-6 shadow-[0_30px_100px_rgba(0,0,0,0.16)]">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Users</div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">Players and sessions</h1>
        </div>
        <form className="flex gap-3" action="/admin/users">
          <input
            type="text"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="id / username / name"
            className="min-w-[260px] rounded-full border border-border/60 bg-background/80 px-4 py-3 text-sm"
          />
          <button className="rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground">Search</button>
        </form>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-muted-foreground">
            <tr className="border-b border-border/60">
              <th className="px-3 py-3 font-medium">User</th>
              <th className="px-3 py-3 font-medium">Telegram</th>
              <th className="px-3 py-3 font-medium">Wallets</th>
              <th className="px-3 py-3 font-medium">Activity</th>
              <th className="px-3 py-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-border/40 align-top">
                <td className="px-3 py-4">
                  <Link className="font-medium text-foreground hover:text-primary" href={`/admin/users/${user.id}`}>
                    {user.username || `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.id}
                  </Link>
                  <div className="mt-1 text-xs text-muted-foreground">{user.id}</div>
                </td>
                <td className="px-3 py-4 text-muted-foreground">{user.telegramId.toString()}</td>
                <td className="px-3 py-4">
                  {user.wallets.map((wallet) => (
                    <div key={wallet.id} className="text-muted-foreground">
                      {wallet.currency}: <span className="text-foreground">{wallet.balance.toString()}</span>
                    </div>
                  ))}
                </td>
                <td className="px-3 py-4 text-muted-foreground">
                  <div>sessions: {user._count.sessions}</div>
                  <div>ledger: {user._count.ledger}</div>
                  <div>rounds: {user._count.roundPlayers}</div>
                  <div>deposits: {user._count.depositIntents}</div>
                </td>
                <td className="px-3 py-4 text-muted-foreground">{new Date(user.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
