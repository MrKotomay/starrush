import { NextResponse } from "next/server"

export function jsonUtf8<T>(body: T, init?: ResponseInit): NextResponse<T> {
  const response = NextResponse.json(body, init)
  response.headers.set("Content-Type", "application/json; charset=utf-8")
  return response
}
