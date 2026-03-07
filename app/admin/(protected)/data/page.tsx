import { PrismaStudioPanel } from "@/components/admin/prisma-studio-panel"

export default function AdminDataPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-border/60 bg-card/85 p-6 shadow-[0_30px_100px_rgba(0,0,0,0.16)]">
        <div className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Data</div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">Embedded Prisma Studio</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
          This screen is meant for inspecting real tables and records. Operational and financial updates should still
          go through dedicated admin actions, where audit logging and domain validation are enforced.
        </p>
      </section>

      <PrismaStudioPanel />
    </div>
  )
}
