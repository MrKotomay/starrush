import postgres from "postgres"
import { serializeError, type StudioBFFRequest } from "@prisma/studio-core/data/bff"
import { createPostgresJSExecutor } from "@prisma/studio-core/data/postgresjs"
import { getAdminStudioDatabaseUrl } from "@/lib/admin"
import { requireAdminRead } from "@/lib/admin-request"
import { jsonUtf8 } from "@/lib/http"

export const runtime = "nodejs"

const studioDatabaseUrl = getAdminStudioDatabaseUrl()
const studioSql = studioDatabaseUrl
  ? postgres(studioDatabaseUrl, {
      max: 1,
      prepare: false,
    })
  : null
const studioExecutor = studioSql ? createPostgresJSExecutor(studioSql) : null

function sameOrigin(req: Request) {
  const origin = req.headers.get("origin")
  if (!origin) return true
  try {
    return new URL(origin).origin === new URL(req.url).origin
  } catch {
    return false
  }
}

export async function POST(req: Request) {
  const access = await requireAdminRead()
  if (!access.ok) {
    return access.response
  }
  if (!sameOrigin(req)) {
    return jsonUtf8({ ok: false, error: "INVALID_ORIGIN" }, { status: 403 })
  }
  if (!studioExecutor) {
    return jsonUtf8({ ok: false, error: "STUDIO_DATABASE_NOT_CONFIGURED" }, { status: 500 })
  }

  const body = (await req.json().catch(() => null)) as StudioBFFRequest | null
  if (!body || typeof body !== "object" || !("procedure" in body)) {
    return jsonUtf8({ ok: false, error: "INVALID_INPUT" }, { status: 400 })
  }

  if (body.procedure === "query") {
    const [error, result] = await studioExecutor.execute(body.query)
    return jsonUtf8([error ? serializeError(error) : null, result ?? null])
  }

  if (body.procedure === "sequence") {
    const first = await studioExecutor.execute(body.sequence[0])
    if (first[0]) {
      return jsonUtf8([[serializeError(first[0]), null]])
    }

    const second = await studioExecutor.execute(body.sequence[1])
    return jsonUtf8([
      [null, first[1] ?? null],
      second[0] ? [serializeError(second[0]), null] : [null, second[1] ?? null],
    ])
  }

  if (body.procedure === "sql-lint") {
    if (studioExecutor.lintSql) {
      const [error, result] = await studioExecutor.lintSql({
        sql: body.sql,
        schemaVersion: body.schemaVersion,
      })
      return jsonUtf8([error ? serializeError(error) : null, result ?? null])
    }

    return jsonUtf8([null, { diagnostics: [], schemaVersion: body.schemaVersion }])
  }

  return jsonUtf8({ ok: false, error: "UNSUPPORTED_PROCEDURE" }, { status: 400 })
}
