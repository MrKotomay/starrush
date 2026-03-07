import Link from "next/link"
import { redirect } from "next/navigation"
import type { ReactNode } from "react"
import { AdminCsrfProvider } from "@/components/admin/admin-csrf-provider"
import { AdminLogoutButton } from "@/components/admin/admin-logout-button"
import { getAdminAccessState, getAdminCsrfToken } from "@/lib/admin"

const navItems = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/rounds", label: "Rounds" },
  { href: "/admin/payments", label: "Payments" },
  { href: "/admin/events", label: "Events / Audit" },
  { href: "/admin/data", label: "Data" },
]

export const dynamic = "force-dynamic"

export default async function ProtectedAdminLayout({
  children,
}: {
  children: ReactNode
}) {
  const [access, csrfToken] = await Promise.all([
    getAdminAccessState(),
    getAdminCsrfToken(),
  ])

  if (access.kind === "unauthenticated") {
    redirect("/admin/login")
  }
  if (access.kind === "forbidden") {
    redirect("/admin/login?error=forbidden")
  }
  if (!csrfToken) {
    redirect("/admin/login?error=csrf")
  }

  return (
    <AdminCsrfProvider token={csrfToken}>
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col px-4 py-4 lg:flex-row lg:gap-6 lg:px-6">
        <aside className="mb-6 rounded-[2rem] border border-border/60 bg-card/85 p-5 shadow-[0_30px_90px_rgba(0,0,0,0.16)] backdrop-blur lg:mb-0 lg:w-[300px] lg:shrink-0">
          <div className="rounded-3xl border border-primary/20 bg-primary/10 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Admin</div>
            <div className="mt-3 text-xl font-semibold text-foreground">
              {access.current.user.username || access.current.user.telegramId}
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              Telegram ID: {access.current.user.telegramId}
            </div>
          </div>

          <nav className="mt-6 space-y-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex rounded-2xl border border-transparent px-4 py-3 text-sm font-medium text-muted-foreground transition hover:border-primary/30 hover:bg-primary/8 hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="mt-8">
            <AdminLogoutButton />
          </div>
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </AdminCsrfProvider>
  )
}
