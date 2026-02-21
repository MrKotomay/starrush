-- Update enums for ledger types and statuses
ALTER TYPE "LedgerType" RENAME VALUE 'BET' TO 'GAME_BET';
ALTER TYPE "LedgerType" RENAME VALUE 'CASHOUT' TO 'GAME_WIN';
ALTER TYPE "LedgerType" ADD VALUE IF NOT EXISTS 'REWARD';
ALTER TYPE "LedgerType" ADD VALUE IF NOT EXISTS 'PURCHASE';
ALTER TYPE "LedgerType" ADD VALUE IF NOT EXISTS 'TRANSFER';

ALTER TYPE "LedgerStatus" RENAME VALUE 'CONFIRMED' TO 'COMPLETED';

-- Session: add revocation timestamp
ALTER TABLE "Session" ADD COLUMN "revokedAt" TIMESTAMP(3);

-- Wallet: add locked balance
ALTER TABLE "Wallet" ADD COLUMN "lockedBalance" DECIMAL(20,9) NOT NULL DEFAULT 0;

-- LedgerEntry: add walletId and referenceId
ALTER TABLE "LedgerEntry" ADD COLUMN "walletId" TEXT;
ALTER TABLE "LedgerEntry" ADD COLUMN "referenceId" VARCHAR(128);

-- Backfill referenceId and walletId
UPDATE "LedgerEntry" SET "referenceId" = COALESCE("reference", CONCAT('legacy-', "id"));

UPDATE "LedgerEntry" le
SET "walletId" = w."id"
FROM "Wallet" w
WHERE le."userId" = w."userId" AND le."currency" = w."currency";

-- Make new columns required
ALTER TABLE "LedgerEntry" ALTER COLUMN "walletId" SET NOT NULL;
ALTER TABLE "LedgerEntry" ALTER COLUMN "referenceId" SET NOT NULL;

-- Drop old reference column
ALTER TABLE "LedgerEntry" DROP COLUMN "reference";

-- Add indexes and constraints
CREATE INDEX "LedgerEntry_walletId_createdAt_idx" ON "LedgerEntry"("walletId", "createdAt");
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "LedgerEntry_walletId_referenceId_type_key" ON "LedgerEntry"("walletId", "referenceId", "type");
