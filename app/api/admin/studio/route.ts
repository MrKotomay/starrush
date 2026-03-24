import postgres from "postgres"
import { serializeError, type StudioBFFRequest } from "@prisma/studio-core/data/bff"
import { createPostgresJSExecutor } from "@prisma/studio-core/data/postgresjs"
import { validateSqlForLint } from "@prisma/studio-core/data/postgres-core"
import { getAdminStudioDatabaseUrl } from "@/lib/admin"
import { originMatchesRequest, requireAdminRead } from "@/lib/admin-request"
import { jsonUtf8 } from "@/lib/http"
import { serializeStudioQueryResult } from "@/lib/prisma-studio"

export const runtime = "nodejs"

let cachedStudioExecutor: ReturnType<typeof createPostgresJSExecutor> | null = null

const READ_ONLY_SQL_FORBIDDEN_PATTERN =
  /\b(insert|update|delete|merge|upsert|create|alter|drop|truncate|grant|revoke|comment|vacuum|analyze|refresh|lock|listen|notify|call|copy|prepare|execute|deallocate|set|begin|commit|rollback|savepoint|release|discard|cluster|reindex|attach|detach|replace|do|into)\b/i

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

function stripSqlNoise(sql: string) {
  let output = ""
  let index = 0

  while (index < sql.length) {
    const char = sql[index]
    const next = sql[index + 1]

    if (char === "-" && next === "-") {
      index += 2
      while (index < sql.length && sql[index] !== "\n" && sql[index] !== "\r") {
        index += 1
      }
      output += " "
      continue
    }

    if (char === "/" && next === "*") {
      index += 2
      while (index < sql.length && !(sql[index] === "*" && sql[index + 1] === "/")) {
        index += 1
      }
      index = Math.min(index + 2, sql.length)
      output += " "
      continue
    }

    if (char === "'") {
      index += 1
      while (index < sql.length) {
        if (sql[index] === "'" && sql[index + 1] === "'") {
          index += 2
          continue
        }
        if (sql[index] === "'") {
          index += 1
          break
        }
        index += 1
      }
      output += " "
      continue
    }

    if (char === '"') {
      index += 1
      while (index < sql.length) {
        if (sql[index] === '"' && sql[index + 1] === '"') {
          index += 2
          continue
        }
        if (sql[index] === '"') {
          index += 1
          break
        }
        index += 1
      }
      output += " "
      continue
    }

    if (char === "$") {
      const dollarTag = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(sql.slice(index))?.[0]
      if (dollarTag) {
        index += dollarTag.length
        const endIndex = sql.indexOf(dollarTag, index)
        if (endIndex < 0) {
          break
        }
        index = endIndex + dollarTag.length
        output += " "
        continue
      }
    }

    output += char
    index += 1
  }

  return output
}

function isReadOnlyStudioStatement(statement: string) {
  return !READ_ONLY_SQL_FORBIDDEN_PATTERN.test(stripSqlNoise(statement))
}

function validateReadOnlyStudioSql(sql: string) {
  const lint = validateSqlForLint(sql)
  if (!lint.ok) {
    return { ok: false as const, error: "INVALID_SQL" }
  }

  if (lint.statements.length !== 1) {
    return { ok: false as const, error: "MULTI_STATEMENT_SQL_NOT_ALLOWED" }
  }

  const statement = lint.statements[0]?.statement
  if (!statement || !isReadOnlyStudioStatement(statement)) {
    return { ok: false as const, error: "READ_ONLY_SQL_ONLY" }
  }

  return { ok: true as const, statement }
}

export async function POST(req: Request) {
  const access = await requireAdminRead()
  if (!access.ok) {
    return access.response
  }
  if (!originMatchesRequest(req)) {
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
    if (!body.query || typeof body.query !== "object" || typeof body.query.sql !== "string") {
      return jsonUtf8({ ok: false, error: "INVALID_INPUT" }, { status: 400 })
    }

    const validation = validateReadOnlyStudioSql(body.query.sql)
    if (!validation.ok) {
      return jsonUtf8({ ok: false, error: validation.error }, { status: 403 })
    }

    const [error, result] = await studioExecutor.execute(body.query)
    return jsonUtf8([error ? serializeError(error) : null, serializeStudioQueryResult(result ?? null)])
  }

  if (body.procedure === "sequence") {
    if (
      !Array.isArray(body.sequence) ||
      body.sequence.length !== 2 ||
      body.sequence.some((query) => !query || typeof query !== "object" || typeof query.sql !== "string")
    ) {
      return jsonUtf8({ ok: false, error: "INVALID_INPUT" }, { status: 400 })
    }

    const firstValidation = validateReadOnlyStudioSql(body.sequence[0].sql)
    const secondValidation = validateReadOnlyStudioSql(body.sequence[1].sql)
    if (!firstValidation.ok || !secondValidation.ok) {
      return jsonUtf8({ ok: false, error: "READ_ONLY_SQL_ONLY" }, { status: 403 })
    }

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
