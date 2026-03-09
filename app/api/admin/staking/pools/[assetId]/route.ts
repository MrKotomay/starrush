import { Prisma } from "@prisma/client"
import { z } from "zod"

import { createAdminAuditLog, findAdminAuditByRequestId } from "@/lib/admin-audit"
import { requireAdminWrite } from "@/lib/admin-request"
import { db } from "@/lib/db"
import { jsonUtf8 } from "@/lib/http"
import { stakingErrorResponse } from "@/lib/staking-http"
import { updateStakingPoolConfig } from "@/services/staking.service"

const bodySchema = z.object({
  enabled: z.boolean().optional(),
  aprBps: z.coerce.number().int().min(0).max(1_000_000).optional(),
  minStake: z.union([z.number().finite(), z.string().trim().min(1)]).optional(),
  unstakeCooldownHours: z.coerce.number().int().min(0).max(24 * 365).optional(),
  rewardReserveDelta: z.union([z.number().finite(), z.string().trim().min(1)]).optional(),
  requestId: z.string().uuid(),
})

export async function POST(
  req: Request,
  context: { params: Promise<{ assetId: string }> },
) {
  const access = await requireAdminWrite(req, "admin:staking-pool-update", { max: 30, windowSeconds: 60 })
  if (!access.ok) {
    return access.response
  }

  const body = await req.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return jsonUtf8({ ok: false, error: "INVALID_INPUT" }, { status: 400 })
  }

  const { assetId } = await context.params
  const existingAudit = await findAdminAuditByRequestId(parsed.data.requestId)
  if (existingAudit) {
    return jsonUtf8({ ok: true, idempotent: true, auditLogId: existingAudit.id })
  }

  try {
    const pool = await db.$transaction(async (tx) => {
      const updatedPool = await updateStakingPoolConfig(
        {
          assetId,
          enabled: parsed.data.enabled,
          aprBps: parsed.data.aprBps,
          minStake: parsed.data.minStake,
          unstakeCooldownHours: parsed.data.unstakeCooldownHours,
          rewardReserveDelta: parsed.data.rewardReserveDelta,
        },
        tx,
      )

      await createAdminAuditLog(
        {
          actorUserId: access.context.current.user.id,
          action: "STAKING_POOL_UPDATED",
          targetType: "StakingPool",
          targetId: updatedPool.id,
          requestId: parsed.data.requestId,
          ip: access.context.ip,
          userAgent: access.context.userAgent,
          metadata: {
            assetId: updatedPool.assetId,
            enabled: updatedPool.enabled,
            aprBps: updatedPool.aprBps,
            minStake: updatedPool.minStake.toString(),
            unstakeCooldownHours: updatedPool.unstakeCooldownHours,
            rewardReserveDelta:
              parsed.data.rewardReserveDelta !== undefined
                ? new Prisma.Decimal(parsed.data.rewardReserveDelta).toString()
                : "0",
            rewardReserve: updatedPool.rewardReserve.toString(),
          },
        },
        tx,
      )

      return updatedPool
    })

    return jsonUtf8({
      ok: true,
      idempotent: false,
      pool: {
        id: pool.id,
        assetId: pool.assetId,
        assetType: pool.assetType,
        walletCurrency: pool.walletCurrency,
        enabled: pool.enabled,
        aprBps: pool.aprBps,
        minStake: pool.minStake.toString(),
        unstakeCooldownHours: pool.unstakeCooldownHours,
        totalStaked: pool.totalStaked.toString(),
        rewardReserve: pool.rewardReserve.toString(),
        updatedAt: pool.updatedAt.toISOString(),
      },
    })
  } catch (error) {
    const response = stakingErrorResponse(error)
    if (response) return response
    throw error
  }
}
