import Link from "next/link"
import { PrismaStudioPanel } from "@/components/admin/prisma-studio-panel"
import { getAdminDataExplorer, type AdminExplorerRow } from "@/lib/admin-data-explorer"

function formatCellValue(value: unknown) {
  if (value === null) {
    return "null"
  }

  if (value === undefined) {
    return "undefined"
  }

  if (typeof value === "bigint") {
    return value.toString()
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (Buffer.isBuffer(value)) {
    const preview = value.toString("hex").slice(0, 48)
    return preview.length === value.length * 2 ? `0x${preview}` : `0x${preview}...`
  }

  if (typeof value === "object") {
    try {
      return JSON.stringify(value)
    } catch {
      return "[unserializable object]"
    }
  }

  return String(value)
}

function buildDataHref(input: {
  mode?: string
  schema?: string
  table?: string
  page?: number
  pageSize?: number
  row?: number
  q?: string
}) {
  const params = new URLSearchParams()

  if (input.mode && input.mode !== "explorer") {
    params.set("mode", input.mode)
  }
  if (input.schema) {
    params.set("schema", input.schema)
  }
  if (input.table) {
    params.set("table", input.table)
  }
  if (input.page && input.page > 1) {
    params.set("page", String(input.page))
  }
  if (input.pageSize && input.pageSize !== 25) {
    params.set("pageSize", String(input.pageSize))
  }
  if (typeof input.row === "number" && input.row >= 0) {
    params.set("row", String(input.row))
  }
  if (input.q) {
    params.set("q", input.q)
  }

  const query = params.toString()
  return query ? `/admin/data?${query}` : "/admin/data"
}

function getExplorerRowTitle(row: AdminExplorerRow) {
  const username = typeof row.username === "string" && row.username.trim().length > 0 ? row.username.trim() : null
  if (username) {
    return `@${username}`
  }

  const firstName = typeof row.firstName === "string" ? row.firstName.trim() : ""
  const lastName = typeof row.lastName === "string" ? row.lastName.trim() : ""
  const fullName = `${firstName} ${lastName}`.trim()
  if (fullName) {
    return fullName
  }

  if (typeof row.eventType === "string" && row.eventType.trim().length > 0) {
    return row.eventType
  }

  if (typeof row.id === "string" && row.id.trim().length > 0) {
    return row.id
  }

  return "Record"
}

function getExplorerQuickLinks(tableName: string, row: AdminExplorerRow) {
  const links: Array<{ href: string; label: string }> = []
  const id = typeof row.id === "string" ? row.id : null
  const userId = typeof row.userId === "string" ? row.userId : null
  const roundId = typeof row.roundId === "string" ? row.roundId : null
  const intentId = typeof row.intentId === "string" ? row.intentId : null

  if (tableName === "User" && id) {
    links.push({ href: `/admin/users/${id}`, label: "Open user card" })
  } else if (userId) {
    links.push({ href: `/admin/users/${userId}`, label: "Open user card" })
  }

  if (tableName === "Round" || roundId) {
    links.push({ href: "/admin/rounds", label: "Open rounds" })
  }

  if (tableName === "DepositIntent" || tableName === "PaymentProviderEvent" || intentId) {
    links.push({ href: "/admin/payments", label: "Open payments" })
  }

  return links.filter(
    (link, index, source) =>
      source.findIndex((candidate) => candidate.href === link.href && candidate.label === link.label) === index,
  )
}

function renderDetailValue(value: unknown) {
  if (value !== null && typeof value === "object" && !Buffer.isBuffer(value) && !(value instanceof Date)) {
    try {
      return (
        <pre className="overflow-x-auto rounded-2xl bg-background/70 p-3 text-xs leading-6 text-foreground/90">
          {JSON.stringify(value, null, 2)}
        </pre>
      )
    } catch {
      return <div className="text-sm text-muted-foreground">[unserializable object]</div>
    }
  }

  const formatted = formatCellValue(value)
  const isEmpty = formatted === "null" || formatted === "undefined"

  return (
    <div className={isEmpty ? "break-words text-sm text-muted-foreground" : "break-words text-sm text-foreground/90"}>
      {formatted}
    </div>
  )
}

function renderExplorerRow(input: {
  row: AdminExplorerRow
  columns: Array<{ name: string }>
  rowIndex: number
  href: string
  isActive: boolean
}) {
  const { row, columns, rowIndex, href, isActive } = input

  return (
    <tr
      key={`row-${rowIndex}`}
      className={isActive ? "border-b border-primary/20 bg-primary/10 align-top" : "border-b border-border/30 align-top"}
    >
      {columns.map((column) => {
        const formatted = formatCellValue(row[column.name])
        const isEmpty = formatted === "null" || formatted === "undefined"

        return (
          <td key={`${rowIndex}-${column.name}`} className="px-3 py-3 text-xs text-foreground/90">
            <Link
              href={href}
              className={
                isEmpty
                  ? "block max-w-[26rem] truncate rounded-lg text-muted-foreground transition hover:text-foreground"
                  : "block max-w-[26rem] truncate rounded-lg transition hover:text-primary"
              }
              title={formatted}
            >
              {formatted}
            </Link>
          </td>
        )
      })}
    </tr>
  )
}

export default async function AdminDataPage({
  searchParams,
}: {
  searchParams: Promise<{
    mode?: string
    schema?: string
    table?: string
    page?: string
    pageSize?: string
    row?: string
    q?: string
  }>
}) {
  const params = await searchParams
  const mode = params.mode === "studio" ? "studio" : "explorer"
  const explorer =
    mode === "explorer"
      ? await getAdminDataExplorer({
          schema: params.schema,
          table: params.table,
          page: params.page ? Number(params.page) : undefined,
          pageSize: params.pageSize ? Number(params.pageSize) : undefined,
          query: params.q,
        })
      : null

  const requestedRowIndex = params.row ? Number(params.row) : Number.NaN
  const selectedRowIndex =
    explorer && Number.isFinite(requestedRowIndex) && requestedRowIndex >= 0 && requestedRowIndex < explorer.rows.length
      ? Math.floor(requestedRowIndex)
      : null
  const selectedRow = selectedRowIndex === null || !explorer ? null : explorer.rows[selectedRowIndex]
  const quickLinks =
    explorer?.selectedTable && selectedRow ? getExplorerQuickLinks(explorer.selectedTable.name, selectedRow) : []

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-border/60 bg-card/85 p-6 shadow-[0_30px_100px_rgba(0,0,0,0.16)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Data</div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">Database explorer</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
              The built-in explorer is the stable default view for browsing tables and rows. Prisma Studio remains
              available as a lower-level fallback when you need its raw embedded UI.
            </p>
          </div>

          <div className="inline-flex rounded-full border border-border/60 bg-background/70 p-1">
            <Link
              href={buildDataHref({
                mode: "explorer",
                schema: params.schema,
                table: params.table,
                page: params.page ? Number(params.page) : undefined,
                pageSize: params.pageSize ? Number(params.pageSize) : undefined,
                row: params.row ? Number(params.row) : undefined,
                q: params.q,
              })}
              className={
                mode === "explorer"
                  ? "rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                  : "rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground transition hover:text-foreground"
              }
            >
              Explorer
            </Link>
            <Link
              href={buildDataHref({ mode: "studio" })}
              className={
                mode === "studio"
                  ? "rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                  : "rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground transition hover:text-foreground"
              }
            >
              Prisma Studio
            </Link>
          </div>
        </div>
      </section>

      {mode === "studio" ? (
        <div className="space-y-4">
          <section className="rounded-[1.75rem] border border-amber-400/20 bg-amber-500/8 p-5 text-sm text-amber-100/90">
            Prisma Studio is kept here as an embedded fallback. If it behaves oddly in your browser, switch back to the
            Explorer tab for the stable read-only table view.
          </section>
          <PrismaStudioPanel />
        </div>
      ) : !explorer?.configured ? (
        <section className="rounded-[1.75rem] border border-danger/30 bg-danger/10 p-6 text-sm text-danger">
          Database explorer is not configured. Set `DATABASE_URL`, `DOCKER_DATABASE_URL`, or `ADMIN_STUDIO_DATABASE_URL`
          for the admin app container.
        </section>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="rounded-[1.75rem] border border-border/60 bg-card/85 p-4 shadow-[0_24px_70px_rgba(0,0,0,0.14)]">
            <form action="/admin/data" className="space-y-3">
              <input type="hidden" name="mode" value="explorer" />
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Tables</div>
              <input
                type="text"
                name="q"
                defaultValue={explorer.tableQuery}
                placeholder="schema.table"
                className="w-full rounded-2xl border border-border/60 bg-background/80 px-4 py-3 text-sm"
              />
              <button className="w-full rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground">
                Filter
              </button>
            </form>

            <div className="mt-4 max-h-[62vh] space-y-2 overflow-y-auto pr-1">
              {explorer.tables.length === 0 ? (
                <div className="rounded-2xl border border-border/50 bg-background/50 px-4 py-3 text-sm text-muted-foreground">
                  No tables matched the current filter.
                </div>
              ) : (
                explorer.tables.map((table) => {
                  const isActive =
                    explorer.selectedTable?.schema === table.schema && explorer.selectedTable?.name === table.name

                  return (
                    <Link
                      key={`${table.schema}.${table.name}`}
                      href={buildDataHref({
                        mode: "explorer",
                        schema: table.schema,
                        table: table.name,
                        page: 1,
                        pageSize: explorer.pageSize,
                        q: explorer.tableQuery,
                      })}
                      className={
                        isActive
                          ? "block rounded-2xl border border-primary/40 bg-primary/12 px-4 py-3"
                          : "block rounded-2xl border border-border/40 bg-background/45 px-4 py-3 transition hover:border-border/70 hover:bg-background/70"
                      }
                    >
                      <div className="text-sm font-semibold text-foreground">{table.name}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {table.schema} | {table.kind === "VIEW" ? "view" : "table"}
                      </div>
                    </Link>
                  )
                })
              )}
            </div>
          </aside>

          <section className="rounded-[1.75rem] border border-border/60 bg-card/85 p-5 shadow-[0_24px_70px_rgba(0,0,0,0.14)]">
            {explorer.selectedTable ? (
              <>
                <div className="flex flex-col gap-4 border-b border-border/50 pb-5 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Explorer</div>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                      {explorer.selectedTable!.schema}.{explorer.selectedTable!.name}
                    </h2>
                    <div className="mt-2 text-sm text-muted-foreground">
                      {explorer.columns.length} columns | page {explorer.page}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {[25, 50, 100].map((size) => {
                      const active = explorer.pageSize === size
                      return (
                        <Link
                          key={size}
                          href={buildDataHref({
                            mode: "explorer",
                            schema: explorer.selectedTable!.schema,
                            table: explorer.selectedTable!.name,
                            page: 1,
                            pageSize: size,
                            q: explorer.tableQuery,
                          })}
                          className={
                            active
                              ? "rounded-full bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
                              : "rounded-full border border-border/60 px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:text-foreground"
                          }
                        >
                          {size}/page
                        </Link>
                      )
                    })}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {explorer.columns.map((column) => (
                    <div
                      key={column.name}
                      className="rounded-full border border-border/50 bg-background/55 px-3 py-2 text-xs text-muted-foreground"
                    >
                      <span className="font-semibold text-foreground">{column.name}</span>
                      <span className="mx-1">|</span>
                      <span>{column.datatype}</span>
                      {column.pkPosition !== null ? <span className="ml-1 text-primary">PK</span> : null}
                    </div>
                  ))}
                </div>

                <div className="mt-5 grid gap-5 2xl:grid-cols-[minmax(0,1fr)_360px]">
                  <div className="space-y-4">
                    <div className="rounded-[1.25rem] border border-border/50 bg-background/35 px-4 py-3 text-sm text-muted-foreground">
                      Click any row to open its detail view. This keeps the fast table browser on the left and the
                      Prisma-like record inspection on the right.
                    </div>

                    <div className="overflow-x-auto rounded-[1.3rem] border border-border/50 bg-background/50">
                      <table className="min-w-full text-left">
                        <thead className="border-b border-border/50 bg-background/80 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                          <tr>
                            {explorer.columns.map((column) => (
                              <th key={column.name} className="px-3 py-3 font-semibold">
                                {column.name}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {explorer.rows.length === 0 ? (
                            <tr>
                              <td
                                colSpan={Math.max(explorer.columns.length, 1)}
                                className="px-4 py-10 text-center text-sm text-muted-foreground"
                              >
                                No rows on this page.
                              </td>
                            </tr>
                          ) : (
                            explorer.rows.map((row, rowIndex) =>
                              renderExplorerRow({
                                row,
                                columns: explorer.columns,
                                rowIndex,
                                href: buildDataHref({
                                  mode: "explorer",
                                  schema: explorer.selectedTable!.schema,
                                  table: explorer.selectedTable!.name,
                                  page: explorer.page,
                                  pageSize: explorer.pageSize,
                                  row: rowIndex,
                                  q: explorer.tableQuery,
                                }),
                                isActive: selectedRowIndex === rowIndex,
                              }),
                            )
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="text-sm text-muted-foreground">
                        Showing {explorer.rows.length} row{explorer.rows.length === 1 ? "" : "s"} on this page.
                      </div>

                      <div className="flex items-center gap-2">
                        {explorer.page > 1 ? (
                          <Link
                            href={buildDataHref({
                              mode: "explorer",
                              schema: explorer.selectedTable!.schema,
                              table: explorer.selectedTable!.name,
                              page: explorer.page - 1,
                              pageSize: explorer.pageSize,
                              q: explorer.tableQuery,
                            })}
                            className="rounded-full border border-border/60 px-4 py-2 text-sm font-semibold text-foreground transition hover:border-border"
                          >
                            Previous
                          </Link>
                        ) : (
                          <span className="rounded-full border border-border/40 px-4 py-2 text-sm font-semibold text-muted-foreground/60">
                            Previous
                          </span>
                        )}

                        {explorer.hasNextPage ? (
                          <Link
                            href={buildDataHref({
                              mode: "explorer",
                              schema: explorer.selectedTable!.schema,
                              table: explorer.selectedTable!.name,
                              page: explorer.page + 1,
                              pageSize: explorer.pageSize,
                              q: explorer.tableQuery,
                            })}
                            className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                          >
                            Next
                          </Link>
                        ) : (
                          <span className="rounded-full border border-border/40 px-4 py-2 text-sm font-semibold text-muted-foreground/60">
                            Next
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <aside className="rounded-[1.3rem] border border-border/50 bg-background/45 p-4 2xl:sticky 2xl:top-6 2xl:self-start">
                    {selectedRow ? (
                      <>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Record</div>
                            <h3 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
                              {getExplorerRowTitle(selectedRow)}
                            </h3>
                            <div className="mt-2 text-sm text-muted-foreground">Row {selectedRowIndex! + 1} on current page</div>
                          </div>

                          <Link
                            href={buildDataHref({
                              mode: "explorer",
                              schema: explorer.selectedTable!.schema,
                              table: explorer.selectedTable!.name,
                              page: explorer.page,
                              pageSize: explorer.pageSize,
                              q: explorer.tableQuery,
                            })}
                            className="rounded-full border border-border/60 px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:text-foreground"
                          >
                            Close
                          </Link>
                        </div>

                        {quickLinks.length > 0 ? (
                          <div className="mt-4 flex flex-wrap gap-2">
                            {quickLinks.map((link) => (
                              <Link
                                key={`${link.href}:${link.label}`}
                                href={link.href}
                                className="rounded-full border border-primary/25 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition hover:bg-primary/15"
                              >
                                {link.label}
                              </Link>
                            ))}
                          </div>
                        ) : null}

                        <div className="mt-5 space-y-3">
                          {explorer.columns.map((column) => (
                            <div key={column.name} className="rounded-2xl border border-border/45 bg-background/60 p-3">
                              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                {column.name}
                              </div>
                              <div className="mt-2">{renderDetailValue(selectedRow[column.name])}</div>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-border/50 bg-background/35 px-4 py-8 text-center text-sm text-muted-foreground">
                        Select a row to open its detail view.
                      </div>
                    )}
                  </aside>
                </div>
              </>
            ) : (
              <div className="rounded-[1.5rem] border border-border/50 bg-background/50 px-5 py-10 text-center text-sm text-muted-foreground">
                No table selected.
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
