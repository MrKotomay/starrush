import { redirect } from "next/navigation"
import { AdminLoginPanel } from "@/components/admin/admin-login-panel"
import { getAdminLoginClientId, getCurrentAdmin } from "@/lib/admin"

const loginErrorMap: Record<string, string> = {
  forbidden: "This Telegram ID is not present in the admin allowlist.",
  csrf: "The admin CSRF token is missing. Please sign in again.",
}

export const dynamic = "force-dynamic"

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const [admin, params] = await Promise.all([getCurrentAdmin(), searchParams])

  if (admin) {
    redirect("/admin")
  }

  return (
    <AdminLoginPanel
      clientId={getAdminLoginClientId()}
      initialError={params.error ? loginErrorMap[params.error] ?? params.error : null}
    />
  )
}
