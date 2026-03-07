"use client"

import dynamic from "next/dynamic"
import { useMemo } from "react"
import { createStudioBFFClient } from "@prisma/studio-core/data/bff"
import { createPostgresAdapter } from "@prisma/studio-core/data/postgres-core"
import styles from "@/components/admin/prisma-studio-panel.module.css"

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
        }),
      }),
    []
  )

  return (
    <div className={styles.panel}>
      <div className={styles.surface}>
        <div className={styles.studioRoot}>
          <Studio adapter={adapter} />
        </div>
      </div>
    </div>
  )
}
