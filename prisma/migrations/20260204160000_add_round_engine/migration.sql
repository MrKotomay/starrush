-- Create enums
CREATE TYPE "RoundStatus" AS ENUM ('WAITING', 'RUNNING', 'CRASHED', 'FINISHED');
CREATE TYPE "RoundPlayerStatus" AS ENUM ('BET_PLACED', 'CASHED_OUT', 'LOST');
CREATE TYPE "RoundEventType" AS ENUM ('ROUND_WAITING', 'ROUND_STARTED', 'MULTIPLIER_UPDATE', 'PLAYER_BET', 'PLAYER_CASHOUT', 'ROUND_CRASHED', 'ROUND_FINISHED');

-- Create Round table
CREATE TABLE "Round" (
  "id" TEXT NOT NULL,
  "status" "RoundStatus" NOT NULL DEFAULT 'WAITING',
  "serverSeedHash" VARCHAR(128) NOT NULL,
  "serverSeed" VARCHAR(128),
  "crashMultiplier" DECIMAL(20,6),
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Round_pkey" PRIMARY KEY ("id")
);

-- Create RoundPlayer table
CREATE TABLE "RoundPlayer" (
  "id" TEXT NOT NULL,
  "roundId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "betAmount" DECIMAL(20,9) NOT NULL,
  "cashoutMultiplier" DECIMAL(20,6),
  "profit" DECIMAL(20,9),
  "status" "RoundPlayerStatus" NOT NULL DEFAULT 'BET_PLACED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RoundPlayer_pkey" PRIMARY KEY ("id")
);

-- Create RoundEventLog table
CREATE TABLE "RoundEventLog" (
  "id" TEXT NOT NULL,
  "roundId" TEXT NOT NULL,
  "eventType" "RoundEventType" NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RoundEventLog_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "Round_status_createdAt_idx" ON "Round"("status", "createdAt");
CREATE UNIQUE INDEX "RoundPlayer_roundId_userId_key" ON "RoundPlayer"("roundId", "userId");
CREATE INDEX "RoundPlayer_roundId_status_idx" ON "RoundPlayer"("roundId", "status");
CREATE INDEX "RoundEventLog_roundId_createdAt_idx" ON "RoundEventLog"("roundId", "createdAt");

-- FKs
ALTER TABLE "RoundPlayer" ADD CONSTRAINT "RoundPlayer_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoundEventLog" ADD CONSTRAINT "RoundEventLog_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;
