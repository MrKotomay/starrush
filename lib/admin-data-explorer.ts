import postgres from "postgres"
import { getAdminStudioDatabaseUrl } from "@/lib/admin"

export type AdminExplorerTable = {
  schema: string
  name: string
  kind: "BASE TABLE" | "VIEW"
}

export type AdminExplorerColumn = {
  name: string
  datatype: string
  datatypeSchema: string
  nullable: boolean
  pkPosition: number | null
}

export type AdminExplorerRow = Record<string, unknown>

export type AdminExplorerState = {
  configured: boolean
  tables: AdminExplorerTable[]
  selectedTable: AdminExplorerTable | null
  columns: AdminExplorerColumn[]
  rows: AdminExplorerRow[]
  page: number
  pageSize: number
  hasNextPage: boolean
  tableQuery: string
}

let cachedAdminExplorerSql: ReturnType<typeof postgres> | null = null

function getAdminExplorerSql() {
  if (cachedAdminExplorerSql) {
    return cachedAdminExplorerSql
  }

  const databaseUrl = getAdminStudioDatabaseUrl()
  if (!databaseUrl) {
    return null
  }

  cachedAdminExplorerSql = postgres(databaseUrl, {
    max: 1,
    prepare: false,
  })
  return cachedAdminExplorerSql
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`
}

function clampPage(value: number | undefined) {
  if (!value || !Number.isFinite(value) || value < 1) {
    return 1
  }

  return Math.floor(value)
}

function clampPageSize(value: number | undefined) {
  const normalized = !value || !Number.isFinite(value) ? 25 : Math.floor(value)
  return Math.min(Math.max(normalized, 10), 100)
}

function buildRowOrder(columns: AdminExplorerColumn[]) {
  const createdAtColumn = columns.find((column) => column.name === "createdAt")
  if (createdAtColumn) {
    return `order by ${quoteIdentifier(createdAtColumn.name)} desc`
  }

  const primaryKeyColumns = [...columns]
    .filter((column) => column.pkPosition !== null)
    .sort((left, right) => (left.pkPosition ?? Number.MAX_SAFE_INTEGER) - (right.pkPosition ?? Number.MAX_SAFE_INTEGER))

  if (primaryKeyColumns.length > 0) {
    return `order by ${primaryKeyColumns.map((column) => `${quoteIdentifier(column.name)} desc`).join(", ")}`
  }

  return ""
}

export async function getAdminDataExplorer(input?: {
  schema?: string
  table?: string
  page?: number
  pageSize?: number
  query?: string
}): Promise<AdminExplorerState> {
  const sql = getAdminExplorerSql()
  const page = clampPage(input?.page)
  const pageSize = clampPageSize(input?.pageSize)
  const tableQuery = input?.query?.trim() ?? ""

  if (!sql) {
    return {
      configured: false,
      tables: [],
      selectedTable: null,
      columns: [],
      rows: [],
      page,
      pageSize,
      hasNextPage: false,
      tableQuery,
    }
  }

  const allTables = await sql<AdminExplorerTable[]>`
    select
      table_schema as schema,
      table_name as name,
      table_type as kind
    from information_schema.tables
    where table_schema not in ('pg_catalog', 'information_schema')
      and table_type in ('BASE TABLE', 'VIEW')
    order by table_schema asc, table_name asc
  `

  const normalizedQuery = tableQuery.toLowerCase()
  const tables =
    normalizedQuery.length === 0
      ? [...allTables]
      : allTables.filter((table) => {
          const fullName = `${table.schema}.${table.name}`.toLowerCase()
          return fullName.includes(normalizedQuery)
        })

  const selectedTable =
    tables.find((table) => table.schema === input?.schema && table.name === input?.table) ?? tables[0] ?? null

  if (!selectedTable) {
    return {
      configured: true,
      tables,
      selectedTable: null,
      columns: [],
      rows: [],
      page,
      pageSize,
      hasNextPage: false,
      tableQuery,
    }
  }

  const columns = await sql<AdminExplorerColumn[]>`
    with primary_keys as (
      select
        kcu.table_schema,
        kcu.table_name,
        kcu.column_name,
        kcu.ordinal_position
      from information_schema.table_constraints as tc
      inner join information_schema.key_column_usage as kcu
        on tc.constraint_name = kcu.constraint_name
       and tc.table_schema = kcu.table_schema
       and tc.table_name = kcu.table_name
      where tc.constraint_type = 'PRIMARY KEY'
    )
    select
      c.column_name as name,
      c.data_type as datatype,
      c.udt_schema as "datatypeSchema",
      c.is_nullable = 'YES' as nullable,
      pk.ordinal_position as "pkPosition"
    from information_schema.columns as c
    left join primary_keys as pk
      on pk.table_schema = c.table_schema
     and pk.table_name = c.table_name
     and pk.column_name = c.column_name
    where c.table_schema = ${selectedTable.schema}
      and c.table_name = ${selectedTable.name}
    order by coalesce(pk.ordinal_position, 999), c.ordinal_position
  `

  const selectList =
    columns.length > 0 ? columns.map((column) => quoteIdentifier(column.name)).join(", ") : "*"
  const qualifiedTable = `${quoteIdentifier(selectedTable.schema)}.${quoteIdentifier(selectedTable.name)}`
  const orderByClause = buildRowOrder(columns)
  const offset = (page - 1) * pageSize
  const rawRows = await sql.unsafe(
    `select ${selectList} from ${qualifiedTable} ${orderByClause} limit $1 offset $2`,
    [pageSize + 1, offset],
  )

  return {
    configured: true,
    tables,
    selectedTable,
    columns,
    rows: rawRows.slice(0, pageSize) as AdminExplorerRow[],
    page,
    pageSize,
    hasNextPage: rawRows.length > pageSize,
    tableQuery,
  }
}
