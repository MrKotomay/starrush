import { NextResponse } from "next/server"

function jsonReplacer(_key: string, value: unknown) {
  if (typeof value === "bigint") {
    return value.toString()
  }

  if (
    value &&
    typeof value === "object" &&
    "constructor" in value &&
    typeof (value as { constructor?: { name?: string } }).constructor?.name === "string" &&
    (value as { constructor: { name: string } }).constructor.name === "Decimal" &&
    "toString" in value &&
    typeof (value as { toString: () => string }).toString === "function"
  ) {
    return (value as { toString: () => string }).toString()
  }

  return value
}

export function jsonUtf8<T>(body: T, init?: ResponseInit): NextResponse<T> {
  const headers = new Headers(init?.headers)
  headers.set("Content-Type", "application/json; charset=utf-8")

  return new NextResponse(JSON.stringify(body, jsonReplacer), {
    ...init,
    headers,
  }) as NextResponse<T>
}
