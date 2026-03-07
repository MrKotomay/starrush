import { listAdminAuditLogs, listBusinessEvents } from "@/lib/admin-data"

export default async function AdminEventsPage() {
  const [events, audit] = await Promise.all([listBusinessEvents(60), listAdminAuditLogs(60)])

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <section className="rounded-[2rem] border border-border/60 bg-card/85 p-6 shadow-[0_30px_100px_rgba(0,0,0,0.16)]">
        <div className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Business events</div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">Gameplay and payment events</h1>
        <div className="mt-6 space-y-4">
          {events.map((event) => (
            <div key={`${event.source}-${event.id}`} className="rounded-3xl border border-border/60 bg-background/75 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-foreground">{event.source} / {event.type}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{event.targetId ?? "n/a"}</div>
                </div>
                <div className="text-xs text-muted-foreground">{new Date(event.createdAt).toLocaleString()}</div>
              </div>
              <pre className="mt-3 overflow-x-auto text-xs text-muted-foreground">{JSON.stringify(event.payload, null, 2)}</pre>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[2rem] border border-border/60 bg-card/85 p-6 shadow-[0_30px_100px_rgba(0,0,0,0.16)]">
        <div className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Audit</div>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">Administrator actions</h2>
        <div className="mt-6 space-y-4">
          {audit.map((entry) => (
            <div key={entry.id} className="rounded-3xl border border-border/60 bg-background/75 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-foreground">{entry.action}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {entry.actorUser.username || entry.actorUser.telegramId.toString()} - {entry.targetType ?? "n/a"} / {entry.targetId ?? "n/a"}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">{new Date(entry.createdAt).toLocaleString()}</div>
              </div>
              <pre className="mt-3 overflow-x-auto text-xs text-muted-foreground">{JSON.stringify(entry.metadata, null, 2)}</pre>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
