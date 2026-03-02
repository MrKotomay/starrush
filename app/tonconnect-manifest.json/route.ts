import { jsonUtf8 } from "@/lib/http"
import { buildTonConnectManifest } from "@/lib/tonconnect-manifest"

export const dynamic = "force-dynamic"

export function GET(req: Request) {
  return jsonUtf8(buildTonConnectManifest(req))
}
