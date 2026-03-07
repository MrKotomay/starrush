import { listAdminRounds } from "@/lib/admin-data"

export default async function AdminRoundsPage() {
  const rounds = await listAdminRounds(80)

  return (
    <div className="rounded-[2rem] border border-border/60 bg-card/85 p-6 shadow-[0_30px_100px_rgba(0,0,0,0.16)]">
      <div className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Rounds</div>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">Rounds and load</h1>

      <div className="mt-6 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-muted-foreground">
            <tr className="border-b border-border/60">
              <th className="px-3 py-3 font-medium">Round</th>
              <th className="px-3 py-3 font-medium">Status</th>
              <th className="px-3 py-3 font-medium">Players</th>
              <th className="px-3 py-3 font-medium">Events</th>
              <th className="px-3 py-3 font-medium">Crash</th>
              <th className="px-3 py-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {rounds.map((round) => (
              <tr key={round.id} className="border-b border-border/40">
                <td className="px-3 py-4 text-foreground">{round.id}</td>
                <td className="px-3 py-4 text-muted-foreground">{round.status}</td>
                <td className="px-3 py-4 text-muted-foreground">{round._count.players}</td>
                <td className="px-3 py-4 text-muted-foreground">{round._count.events}</td>
                <td className="px-3 py-4 text-muted-foreground">{round.crashMultiplier?.toString() ?? "-"}</td>
                <td className="px-3 py-4 text-muted-foreground">{new Date(round.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
