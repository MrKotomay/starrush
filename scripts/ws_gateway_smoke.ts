import WebSocket from "ws"

const url = process.env.WS_GATEWAY_URL ?? "ws://localhost:8081"
const cookie = process.env.WS_TEST_COOKIE

if (!cookie) {
  console.error("WS_TEST_COOKIE is required (e.g., sr_session=...)")
  process.exit(1)
}

const ws = new WebSocket(url, {
  headers: {
    Cookie: cookie,
  },
})

ws.on("open", () => {
  console.log("[Smoke] connected")
  ws.send(JSON.stringify({ type: "ping", payload: {} }))
})

ws.on("message", (data) => {
  console.log("[Smoke] message", data.toString())
})

ws.on("close", (code, reason) => {
  console.log("[Smoke] closed", code, reason.toString())
  process.exit(0)
})

ws.on("error", (err) => {
  console.error("[Smoke] error", err)
  process.exit(1)
})
