import { LedgerStatus, LedgerType } from "@prisma/client"
import { getCurrentUser } from "@/lib/auth"
import { db } from "@/lib/db"
import { jsonUtf8 } from "@/lib/http"
import { buildReferralLink, getReferralDepositRate, isReferralRewardReference } from "@/lib/referrals"

export async function GET() {
  const current = await getCurrentUser()
  if (!current) {
    return jsonUtf8({ ok: false, error: "UNAUTHORIZED" }, { status: 401 })
  }

  const [invitedCount, referralRewards] = await Promise.all([
    db.user.count({
      where: {
        referredById: current.user.id,
      },
    }),
    db.ledgerEntry.findMany({
      where: {
        userId: current.user.id,
        type: LedgerType.REWARD,
        status: LedgerStatus.COMPLETED,
      },
      select: {
        currency: true,
        amount: true,
        referenceId: true,
      },
    }),
  ])

  let earnedTon = "0"
  let earnedStars = "0"

  for (const reward of referralRewards) {
    if (!isReferralRewardReference(reward.referenceId)) continue
    if (reward.currency === "TON") {
      earnedTon = reward.amount.plus(earnedTon).toString()
      continue
    }
    earnedStars = reward.amount.plus(earnedStars).toString()
  }

  return jsonUtf8({
    ok: true,
    summary: {
      invitedCount,
      earnedTon,
      earnedStars,
      commissionRate: getReferralDepositRate().toString(),
      referralLink: buildReferralLink(current.user.id),
    },
  })
}

