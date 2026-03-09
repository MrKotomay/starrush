ALTER TYPE "LedgerType" ADD VALUE IF NOT EXISTS 'STAKING_STAKE';
ALTER TYPE "LedgerType" ADD VALUE IF NOT EXISTS 'STAKING_UNSTAKE';
ALTER TYPE "LedgerType" ADD VALUE IF NOT EXISTS 'STAKING_REWARD';

CREATE TYPE "StakingAssetType" AS ENUM ('TON', 'STARS', 'GIFT');
CREATE TYPE "StakingUnstakeStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELED');
CREATE TYPE "StakingEventType" AS ENUM (
  'STAKE',
  'CLAIM',
  'UNSTAKE_REQUEST',
  'UNSTAKE_COMPLETE',
  'ADMIN_POOL_UPDATED',
  'ADMIN_RESERVE_ADJUSTMENT'
);

CREATE TABLE "StakingPool" (
  "id" TEXT NOT NULL,
  "assetId" VARCHAR(32) NOT NULL,
  "assetType" "StakingAssetType" NOT NULL,
  "walletCurrency" "Currency",
  "symbol" VARCHAR(32) NOT NULL,
  "icon" VARCHAR(256) NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "aprBps" INTEGER NOT NULL DEFAULT 600,
  "minStake" DECIMAL(20,9) NOT NULL DEFAULT 0,
  "unstakeCooldownHours" INTEGER NOT NULL DEFAULT 24,
  "totalStaked" DECIMAL(20,9) NOT NULL DEFAULT 0,
  "rewardReserve" DECIMAL(20,9) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StakingPool_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StakingPosition" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "poolId" TEXT NOT NULL,
  "stakedPrincipal" DECIMAL(20,9) NOT NULL DEFAULT 0,
  "pendingReward" DECIMAL(20,9) NOT NULL DEFAULT 0,
  "totalClaimed" DECIMAL(20,9) NOT NULL DEFAULT 0,
  "totalUnstaked" DECIMAL(20,9) NOT NULL DEFAULT 0,
  "lastAccruedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StakingPosition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StakingUnstakeRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "poolId" TEXT NOT NULL,
  "positionId" TEXT NOT NULL,
  "amount" DECIMAL(20,9) NOT NULL,
  "status" "StakingUnstakeStatus" NOT NULL DEFAULT 'PENDING',
  "availableAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StakingUnstakeRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StakingPositionEvent" (
  "id" TEXT NOT NULL,
  "poolId" TEXT NOT NULL,
  "userId" TEXT,
  "positionId" TEXT,
  "unstakeRequestId" TEXT,
  "eventType" "StakingEventType" NOT NULL,
  "amount" DECIMAL(20,9),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StakingPositionEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StakingPool_assetId_key" ON "StakingPool"("assetId");
CREATE INDEX "StakingPool_assetType_idx" ON "StakingPool"("assetType");
CREATE INDEX "StakingPool_enabled_assetId_idx" ON "StakingPool"("enabled", "assetId");

CREATE UNIQUE INDEX "StakingPosition_userId_poolId_key" ON "StakingPosition"("userId", "poolId");
CREATE INDEX "StakingPosition_poolId_updatedAt_idx" ON "StakingPosition"("poolId", "updatedAt");
CREATE INDEX "StakingPosition_userId_updatedAt_idx" ON "StakingPosition"("userId", "updatedAt");

CREATE INDEX "StakingUnstakeRequest_userId_poolId_status_idx" ON "StakingUnstakeRequest"("userId", "poolId", "status");
CREATE INDEX "StakingUnstakeRequest_availableAt_status_idx" ON "StakingUnstakeRequest"("availableAt", "status");
CREATE INDEX "StakingUnstakeRequest_positionId_status_idx" ON "StakingUnstakeRequest"("positionId", "status");

CREATE INDEX "StakingPositionEvent_poolId_createdAt_idx" ON "StakingPositionEvent"("poolId", "createdAt");
CREATE INDEX "StakingPositionEvent_userId_createdAt_idx" ON "StakingPositionEvent"("userId", "createdAt");
CREATE INDEX "StakingPositionEvent_positionId_createdAt_idx" ON "StakingPositionEvent"("positionId", "createdAt");

ALTER TABLE "StakingPosition"
  ADD CONSTRAINT "StakingPosition_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StakingPosition"
  ADD CONSTRAINT "StakingPosition_poolId_fkey"
  FOREIGN KEY ("poolId") REFERENCES "StakingPool"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StakingUnstakeRequest"
  ADD CONSTRAINT "StakingUnstakeRequest_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StakingUnstakeRequest"
  ADD CONSTRAINT "StakingUnstakeRequest_poolId_fkey"
  FOREIGN KEY ("poolId") REFERENCES "StakingPool"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StakingUnstakeRequest"
  ADD CONSTRAINT "StakingUnstakeRequest_positionId_fkey"
  FOREIGN KEY ("positionId") REFERENCES "StakingPosition"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StakingPositionEvent"
  ADD CONSTRAINT "StakingPositionEvent_poolId_fkey"
  FOREIGN KEY ("poolId") REFERENCES "StakingPool"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StakingPositionEvent"
  ADD CONSTRAINT "StakingPositionEvent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StakingPositionEvent"
  ADD CONSTRAINT "StakingPositionEvent_positionId_fkey"
  FOREIGN KEY ("positionId") REFERENCES "StakingPosition"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StakingPositionEvent"
  ADD CONSTRAINT "StakingPositionEvent_unstakeRequestId_fkey"
  FOREIGN KEY ("unstakeRequestId") REFERENCES "StakingUnstakeRequest"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
