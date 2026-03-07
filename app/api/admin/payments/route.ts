import { listAdminPayments } from "@/lib/admin-data"
import { requireAdminRead } from "@/lib/admin-request"
import { jsonUtf8 } from "@/lib/http"

export async function GET(req: Request) {
  const access = await requireAdminRead()
  if (!access.ok) {
    return access.response
  }

  const limit = Number(new URL(req.url).searchParams.get("limit") ?? "50")
  return jsonUtf8({ ok: true, payments: await listAdminPayments(limit) })
}
