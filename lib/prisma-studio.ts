type StudioQueryResultLike = unknown[] & {
  columns?: unknown
  command?: unknown
  count?: unknown
  state?: unknown
  statement?: unknown
}

type SerializedStudioQueryResult = {
  __studioQueryResult: true
  rows: unknown[]
  columns: unknown
  command: unknown
  count: unknown
  state: unknown
  statement: unknown
}

function isSerializedStudioQueryResult(value: unknown): value is SerializedStudioQueryResult {
  return Boolean(
    value &&
      typeof value === "object" &&
      "__studioQueryResult" in value &&
      (value as { __studioQueryResult?: unknown }).__studioQueryResult === true
  )
}

export function serializeStudioQueryResult(result: unknown) {
  if (!Array.isArray(result)) {
    return result
  }

  const queryResult = result as StudioQueryResultLike
  return {
    __studioQueryResult: true,
    rows: Array.from(queryResult),
    columns: queryResult.columns ?? null,
    command: queryResult.command ?? null,
    count: queryResult.count ?? null,
    state: queryResult.state ?? null,
    statement: queryResult.statement ?? null,
  } satisfies SerializedStudioQueryResult
}

export function deserializeStudioQueryResult(result: unknown): unknown[] {
  if (!isSerializedStudioQueryResult(result)) {
    return Array.isArray(result) ? result : []
  }

  const restoredRows = Array.isArray(result.rows) ? [...result.rows] : []
  return Object.assign(restoredRows, {
    columns: result.columns,
    command: result.command,
    count: result.count,
    state: result.state,
    statement: result.statement,
  })
}
