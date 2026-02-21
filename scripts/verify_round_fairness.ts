import { verifyRoundFairnessById } from "../services/game-fairness.service"
import { db } from "../lib/db"

async function main() {
  const roundId = process.argv[2]
  if (!roundId) {
    throw new Error("Usage: tsx scripts/verify_round_fairness.ts <roundId>")
  }

  const verification = await verifyRoundFairnessById(roundId)
  console.log(JSON.stringify(verification, null, 2))

  if (!verification.verified) {
    process.exitCode = 1
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })

