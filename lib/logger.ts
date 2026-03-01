type LogLevel = "debug" | "info" | "warn" | "error"

type LogFields = Record<string, unknown>

type NormalizedError = {
  name?: string
  message?: string
  stack?: string
}

function normalizeError(error: unknown): NormalizedError | undefined {
  if (!(error instanceof Error)) return undefined

  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
  }
}

function writeLog(level: LogLevel, service: string, message: string, fields?: LogFields) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    service,
    msg: message,
    ...fields,
  }

  const method =
    level === "debug" ? console.debug : level === "info" ? console.info : level === "warn" ? console.warn : console.error

  method(JSON.stringify(entry))
}

export function createLogger(service: string) {
  return {
    debug(message: string, fields?: LogFields) {
      writeLog("debug", service, message, fields)
    },
    info(message: string, fields?: LogFields) {
      writeLog("info", service, message, fields)
    },
    warn(message: string, fields?: LogFields) {
      writeLog("warn", service, message, fields)
    },
    error(message: string, fields?: LogFields & { error?: unknown }) {
      const normalizedFields = fields?.error
        ? {
            ...fields,
            error: normalizeError(fields.error),
          }
        : fields

      writeLog("error", service, message, normalizedFields)
    },
  }
}
