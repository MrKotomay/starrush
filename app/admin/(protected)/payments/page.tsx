import { listAdminPayments } from "@/lib/admin-data"

export default async function AdminPaymentsPage() {
  const payments = await listAdminPayments(80)

  return (
    <div className="rounded-[2rem] border border-border/60 bg-card/85 p-6 shadow-[0_30px_100px_rgba(0,0,0,0.16)]">
      <div className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Payments</div>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">Deposit intents and provider events</h1>

      <div className="mt-6 space-y-4">
        {payments.map((payment) => (
          <div key={payment.id} className="rounded-[1.7rem] border border-border/60 bg-background/75 p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="text-sm font-semibold text-foreground">
                  {payment.provider} / {payment.status}
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  {payment.amount.toString()} {payment.currency} - {payment.user.username || payment.user.telegramId.toString()}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{payment.id}</div>
              </div>
              <div className="text-xs text-muted-foreground">{new Date(payment.createdAt).toLocaleString()}</div>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {payment.events.map((event) => (
                <div key={event.id} className="rounded-3xl border border-border/60 bg-card/80 p-4">
                  <div className="text-sm font-medium text-foreground">{event.eventType}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{event.status}</div>
                  <pre className="mt-3 overflow-x-auto text-xs text-muted-foreground">{JSON.stringify(event.payload, null, 2)}</pre>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
