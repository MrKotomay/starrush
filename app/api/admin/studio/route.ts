import postgres from "postgres"
import { serializeError, type StudioBFFRequest } from "@prisma/studio-core/data/bff"
import { createPostgresJSExecutor } from "@prisma/studio-core/data/postgresjs"
import { getAdminStudioDatabaseUrl } from "@/lib/admin"
import { originMatchesRequest, requireAdminRead } from "@/lib/admin-request"
import { jsonUtf8 } from "@/lib/http"
import { serializeStudioQueryResult } from "@/lib/prisma-studio"

export const runtime = "nodejs"

let cachedStudioExecutor: ReturnType<typeof createPostgresJSExecutor> | null = null

function getStudioExecutor() {
  if (cachedStudioExecutor) {
    return cachedStudioExecutor
  }

  const studioDatabaseUrl = getAdminStudioDatabaseUrl()
  if (!studioDatabaseUrl) {
    return null
  }

  const studioSql = postgres(studioDatabaseUrl, {
    max: 1,
    prepare: false,
  })
  cachedStudioExecutor = createPostgresJSExecutor(studioSql)
  return cachedStudioExecutor
}

export async function POST(req: Request) {
  const access = await requireAdminRead()
  if (!access.ok) {
    return access.response
  }
  if (!originMatchesRequest(req, { allowMissingOrigin: true })) {
    return jsonUtf8({ ok: false, error: "INVALID_ORIGIN" }, { status: 403 })
  }
  const studioExecutor = getStudioExecutor()
  if (!studioExecutor) {
    return jsonUtf8({ ok: false, error: "STUDIO_DATABASE_NOT_CONFIGURED" }, { status: 500 })
  }

  const body = (await req.json().catch(() => null)) as StudioBFFRequest | null
  if (!body || typeof body !== "object" || !("procedure" in body)) {
    return jsonUtf8({ ok: false, error: "INVALID_INPUT" }, { status: 400 })
  }

  if (body.procedure === "query") {
    const [error, result] = await studioExecutor.execute(body.query)
    return jsonUtf8([error ? serializeError(error) : null, serializeStudioQueryResult(result ?? null)])
  }

  if (body.procedure === "sequence") {
    const first = await studioExecutor.execute(body.sequence[0])
    if (first[0]) {
      return jsonUtf8([[serializeError(first[0]), null]])
    }

    const second = await studioExecutor.execute(body.sequence[1])
    return jsonUtf8([
      [null, serializeStudioQueryResult(first[1] ?? null)],
      second[0]
        ? [serializeError(second[0]), null]
        : [null, serializeStudioQueryResult(second[1] ?? null)],
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
