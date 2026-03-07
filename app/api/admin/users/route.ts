import { listAdminUsers } from "@/lib/admin-data"
import { requireAdminRead } from "@/lib/admin-request"
import { jsonUtf8 } from "@/lib/http"

export async function GET(req: Request) {
  const access = await requireAdminRead()
  if (!access.ok) {
    return access.response
  }

  const url = new URL(req.url)
  const query = url.searchParams.get("q") ?? undefined
  const limit = Number(url.searchParams.get("limit") ?? "50")

  return jsonUtf8({
    ok: true,
    users: await listAdminUsers({ query, limit }),
  })
}
