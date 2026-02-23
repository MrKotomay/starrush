import { z } from "zod"
import { getCurrentUser } from "@/lib/auth"
import { db } from "@/lib/db"
import { jsonUtf8 } from "@/lib/http"
import { paymentsConfig } from "@/lib/payments/config"
import { rateLimit } from "@/lib/rate-limit"

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
})

export async function GET(req: Request) {
  if (!paymentsConfig.enableGiftsStub) {
    return jsonUtf8({ ok: false, error: "GIFTS_STUB_DISABLED" }, { status: 403 })
  }

  const current = await getCurrentUser()
  if (!current) {
    return jsonUtf8({ ok: false, error: "UNAUTHORIZED" }, { status: 401 })
  }

  const rate = await rateLimit(
    `gifts:stub:${current.user.id}`,
    paymentsConfig.depositRateLimitMax * 2,
    paymentsConfig.depositRateLimitWindowSeconds
  )
  if (!rate.allowed) {
    return jsonUtf8({ ok: false, error: "RATE_LIMIT" }, { status: 429 })
  }

  const url = new URL(req.url)
  const parsed = querySchema.safeParse({ limit: url.searchParams.get("limit") ?? undefined })
  const limit = parsed.success ? parsed.data.limit : 30

  const gifts = await db.userGiftStub.findMany({
    where: { userId: current.user.id },
    include: {
      giftIngressEvent: {
        select: {
          id: true,
          telegramGiftId: true,
          fromTelegramId: true,
          toTelegramId: true,
          createdAt: true,
          payload: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  })

  return jsonUtf8({
    ok: true,
    gifts: gifts.map((gift) => ({
      id: gift.id,
      giftType: gift.giftType,
      quantity: gift.quantity,
      metadata: gift.metadata,
      createdAt: gift.createdAt,
      ingress: {
        id: gift.giftIngressEvent.id,
        telegramGiftId: gift.giftIngressEvent.telegramGiftId,
        fromTelegramId: gift.giftIngressEvent.fromTelegramId?.toString() ?? null,
        toTelegramId: gift.giftIngressEvent.toTelegramId?.toString() ?? null,
        createdAt: gift.giftIngressEvent.createdAt,
        payload: gift.giftIngressEvent.payload,
      },
    })),
  })
}
