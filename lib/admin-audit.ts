import { Prisma } from "@prisma/client"
import { db } from "@/lib/db"

export type AdminAuditInput = {
  actorUserId: string
  action: string
  targetType?: string | null
  targetId?: string | null
  requestId?: string | null
  ip?: string | null
  userAgent?: string | null
  metadata?: Prisma.InputJsonValue
}

export async function createAdminAuditLog(
  input: AdminAuditInput,
  tx?: Prisma.TransactionClient,
) {
  const client = tx ?? db
  return client.adminAuditLog.create({
    data: {
      actorUserId: input.actorUserId,
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      requestId: input.requestId ?? null,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      metadata: input.metadata,
    },
  })
}

export async function findAdminAuditByRequestId(requestId: string) {
  return db.adminAuditLog.findUnique({
    where: { requestId },
  })
}
