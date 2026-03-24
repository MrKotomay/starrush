import path from "node:path"
import { defineConfig } from "prisma/config"

try {
  process.loadEnvFile?.(path.resolve(process.cwd(), ".env"))
} catch (error) {
  if ((error as NodeJS.ErrnoException | undefined)?.code !== "ENOENT") {
    throw error
  }
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
})
