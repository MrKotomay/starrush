import { getAdminUserDetail } from "@/lib/admin-data"
import { requireAdminRead } from "@/lib/admin-request"
import { jsonUtf8 } from "@/lib/http"

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const access = await requireAdminRead()
  if (!access.ok) {
    return access.response
  }

  const { id } = await context.params
  const user = await getAdminUserDetail(id)
  if (!user) {
    return jsonUtf8({ ok: false, error: "NOT_FOUND" }, { status: 404 })
  }

  return jsonUtf8({ ok: true, user })
}
