import path from "node:path"

let didAttemptLoad = false

function loadLocalEnvFile() {
  if (didAttemptLoad) return
  didAttemptLoad = true

  if (typeof process.loadEnvFile !== "function") return

  try {
    process.loadEnvFile(path.resolve(process.cwd(), ".env"))
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return
    }

    throw error
  }
}

loadLocalEnvFile()

export {}
