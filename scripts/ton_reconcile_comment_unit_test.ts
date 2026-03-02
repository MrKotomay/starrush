import assert from "node:assert/strict"

process.env.TONAPI_KEY = process.env.TONAPI_KEY || "test-key"

async function main() {
  const { buildTonConnectCommentPayload, buildTonDepositComment, decodeTonMessageComment, findMatchingTonTransaction } =
    await import("../lib/payments/ton.service")

  const comment = buildTonDepositComment("intent-123")
  const payloadBase64 = buildTonConnectCommentPayload(comment)
  const rawBodyHex = Buffer.from(payloadBase64, "base64").toString("hex")

  assert.equal(decodeTonMessageComment(rawBodyHex), comment)

  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () =>
    ({
      ok: true,
      async json() {
        return {
          transactions: [
            {
              hash: "recipient_tx_hash",
              lt: "100",
              utime: 1_700_000_000,
              success: true,
              in_msg: {
                source: {
                  address: "0:1111111111111111111111111111111111111111111111111111111111111111",
                },
                value: "500000000",
                hash: "internal_msg_hash",
                raw_body: rawBodyHex,
              },
            },
          ],
        }
      },
    }) as Response)

  try {
    const matched = await findMatchingTonTransaction({
      txHash: "external_message_hash_that_should_not_be_required_here",
      senderAddress: "EQAREREREREREREREREREREREREREREREREREREREREREeYT",
      recipientAddress: "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c",
      minAmountNano: BigInt("500000000"),
      expectedComment: comment,
      notOlderThanUnix: 1_699_999_900,
    })

    assert.ok(matched)
    assert.equal(matched?.comment, comment)
    assert.equal(matched?.txHash, "recipient_tx_hash")
  } finally {
    globalThis.fetch = originalFetch
  }

  console.log("ton_reconcile_comment_unit_test: ok")
}

void main()
