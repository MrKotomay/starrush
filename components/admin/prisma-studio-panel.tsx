"use client"

import { createStudioBFFClient } from "@prisma/studio-core/data/bff"
import { createPostgresAdapter } from "@prisma/studio-core/data/postgres-core"
import { Studio } from "@prisma/studio-core/ui"

const adapter = createPostgresAdapter({
  executor: createStudioBFFClient({
    url: "/api/admin/studio",
  }),
})

export function PrismaStudioPanel() {
  return (
    <div className="overflow-hidden rounded-[2rem] border border-border/60 bg-card/90 p-2 shadow-[0_35px_120px_rgba(0,0,0,0.18)]">
      <div className="rounded-[1.4rem] bg-white">
        <Studio adapter={adapter} />
      </div>
    </div>
  )
}
