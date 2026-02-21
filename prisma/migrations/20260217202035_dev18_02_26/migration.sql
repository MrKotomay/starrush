-- DropForeignKey
ALTER TABLE "RoundEventLog" DROP CONSTRAINT "RoundEventLog_roundId_fkey";

-- DropForeignKey
ALTER TABLE "RoundPlayer" DROP CONSTRAINT "RoundPlayer_roundId_fkey";

-- DropForeignKey
ALTER TABLE "RoundQueuedBet" DROP CONSTRAINT "RoundQueuedBet_userId_fkey";

-- AlterTable
ALTER TABLE "HouseWallet" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "RoundPlayer" ALTER COLUMN "currency" DROP DEFAULT;

-- AlterTable
ALTER TABLE "RoundQueuedBet" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "RoundPlayer" ADD CONSTRAINT "RoundPlayer_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoundQueuedBet" ADD CONSTRAINT "RoundQueuedBet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoundEventLog" ADD CONSTRAINT "RoundEventLog_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
