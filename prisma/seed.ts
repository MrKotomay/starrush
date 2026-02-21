import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()

async function main() {
  const user = await db.user.upsert({
    where: { telegramId: BigInt(1) },
    create: {
      telegramId: BigInt(1),
      username: "seed_user",
      firstName: "Seed",
      lastName: "User",
      isBot: false,
    },
    update: {},
  })

  await db.wallet.upsert({
    where: { userId_currency: { userId: user.id, currency: "TON" } },
    create: { userId: user.id, currency: "TON" },
    update: {},
  })

  await db.wallet.upsert({
    where: { userId_currency: { userId: user.id, currency: "STARS" } },
    create: { userId: user.id, currency: "STARS" },
    update: {},
  })
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
