import assert from "node:assert/strict"

process.env.TONAPI_KEY = process.env.TONAPI_KEY || "test-key"

async function main() {
  const { buildTonConnectCommentPayload, buildTonDepositComment, findMatchingTonTransaction } =
    await import("../lib/payments/ton.service")

  const comment = buildTonDepositComment("intent-bounced")
  const payloadBase64 = buildTonConnectCommentPayload(comment)
  const rawBodyHex = Buffer.from(payloadBase64, "base64").toString("hex")

  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () =>
    ({
      ok: true,
      async json() {
        return {
          transactions: [
            {
              hash: "recipient_failed_tx_hash",
              lt: "200",
              utime: 1_700_000_100,
              success: false,
              bounce_phase: "TrPhaseBounceOk",
              in_msg: {
                source: {
                  address: "0:1111111111111111111111111111111111111111111111111111111111111111",
                },
                value: "250000000",
                hash: "failed_internal_msg_hash",
                raw_body: rawBodyHex,
                bounce: true,
              },
              out_msgs: [
                {
                  destination: {
                    address: "0:1111111111111111111111111111111111111111111111111111111111111111",
                  },
                  bounced: true,
                  decoded_op_name: "bounce",
                },
              ],
            },
          ],
        }
      },
    }) as Response)

  try {
    const matched = await findMatchingTonTransaction({
      senderAddress: "EQAREREREREREREREREREREREREREREREREREREREREREeYT",
      recipientAddress: "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c",
      minAmountNano: BigInt("250000000"),
      expectedComment: comment,
      notOlderThanUnix: 1_699_999_900,
    })

    assert.ok(matched)
    assert.equal(matched?.status, "failed")
    assert.equal(matched?.txHash, "recipient_failed_tx_hash")
    assert.equal(matched?.failureReason, "TON transfer bounced back to sender")
  } finally {
    globalThis.fetch = originalFetch
  }

  console.log("ton_reconcile_failed_unit_test: ok")
}

void main()
