import { jsonUtf8 } from "@/lib/http"

export async function GET() {
  return jsonUtf8({
    ok: true,
    status: "live",
    service: "app",
    serverTime: Date.now(),
  })
}
