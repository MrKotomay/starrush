import { getAdminDashboardData } from "@/lib/admin-data"
import { requireAdminRead } from "@/lib/admin-request"
import { jsonUtf8 } from "@/lib/http"

export async function GET() {
  const access = await requireAdminRead()
  if (!access.ok) {
    return access.response
  }

  return jsonUtf8({ ok: true, dashboard: await getAdminDashboardData() })
}
