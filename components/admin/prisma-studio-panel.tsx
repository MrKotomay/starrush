"use client"

import dynamic from "next/dynamic"
import { useMemo } from "react"
import { createStudioBFFClient } from "@prisma/studio-core/data/bff"
import { createPostgresAdapter } from "@prisma/studio-core/data/postgres-core"
import styles from "@/components/admin/prisma-studio-panel.module.css"
import { deserializeStudioQueryResult } from "@/lib/prisma-studio"

const Studio = dynamic(
  () => import("@prisma/studio-core/ui").then((module) => module.Studio),
  {
    ssr: false,
    loading: () => (
      <div className={styles.loadingShell}>
        <div className={styles.loadingTitle}>Loading Prisma Studio...</div>
        <div className={styles.loadingText}>Preparing the embedded database view.</div>
      </div>
    ),
  }
)

export function PrismaStudioPanel() {
  const adapter = useMemo(
    () =>
      createPostgresAdapter({
        executor: createStudioBFFClient({
          url: "/api/admin/studio",
          resultDeserializerFn: deserializeStudioQueryResult,
        }),
      }),
    []
  )

  return (
    <div className={styles.panel}>
      <div className={styles.surface}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            marginBottom: 12,
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid rgba(148, 163, 184, 0.22)",
            background: "rgba(15, 23, 42, 0.35)",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Read-only Studio
            </div>
            <div style={{ fontSize: 13, opacity: 0.8, lineHeight: 1.45 }}>
              Browse schemas and inspect data. Row edits and SQL writes are blocked by the server.
            </div>
          </div>
          <div
            style={{
              flex: "0 0 auto",
              padding: "6px 10px",
              borderRadius: 999,
              border: "1px solid rgba(148, 163, 184, 0.28)",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            Browse only
          </div>
        </div>
        <div className={styles.studioRoot}>
          <Studio adapter={adapter} />
        </div>
      </div>
    </div>
  )
}
