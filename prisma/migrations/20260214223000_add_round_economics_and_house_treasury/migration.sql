DO $$
BEGIN
  CREATE TYPE "HouseLedgerType" AS ENUM ('INITIAL_BANKROLL', 'BET_LOSS_SETTLEMENT', 'BET_WIN', 'ADJUSTMENT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Round" ADD COLUMN IF NOT EXISTS "houseEdge" DECIMAL(10,6);
ALTER TABLE "Round" ADD COLUMN IF NOT EXISTS "maxCrash" DECIMAL(20,6);

UPDATE "Round"
SET "houseEdge" = 0.01
WHERE "houseEdge" IS NULL;

UPDATE "Round"
SET "maxCrash" = 1000
WHERE "maxCrash" IS NULL;

ALTER TABLE "Round" ALTER COLUMN "houseEdge" SET DEFAULT 0.01;
ALTER TABLE "Round" ALTER COLUMN "houseEdge" SET NOT NULL;
ALTER TABLE "Round" ALTER COLUMN "maxCrash" SET DEFAULT 1000;
ALTER TABLE "Round" ALTER COLUMN "maxCrash" SET NOT NULL;

DO $$
BEGIN
  ALTER TABLE "Round"
    ADD CONSTRAINT "Round_houseEdge_range_chk"
    CHECK ("houseEdge" > 0 AND "houseEdge" < 1);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "Round"
    ADD CONSTRAINT "Round_maxCrash_min_chk"
    CHECK ("maxCrash" >= 1.01);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "HouseWallet" (
  "id" TEXT NOT NULL,
  "currency" "Currency" NOT NULL,
  "balance" DECIMAL(20,9) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HouseWallet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "HouseLedgerEntry" (
  "id" TEXT NOT NULL,
  "houseWalletId" TEXT NOT NULL,
  "currency" "Currency" NOT NULL,
  "amount" DECIMAL(20,9) NOT NULL,
  "type" "HouseLedgerType" NOT NULL,
  "roundId" TEXT,
  "userId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HouseLedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "HouseWallet_currency_key" ON "HouseWallet"("currency");
CREATE INDEX IF NOT EXISTS "HouseWallet_currency_idx" ON "HouseWallet"("currency");
CREATE INDEX IF NOT EXISTS "HouseLedgerEntry_currency_createdAt_idx" ON "HouseLedgerEntry"("currency", "createdAt");
CREATE INDEX IF NOT EXISTS "HouseLedgerEntry_houseWalletId_createdAt_idx" ON "HouseLedgerEntry"("houseWalletId", "createdAt");
CREATE INDEX IF NOT EXISTS "HouseLedgerEntry_roundId_createdAt_idx" ON "HouseLedgerEntry"("roundId", "createdAt");
CREATE INDEX IF NOT EXISTS "HouseLedgerEntry_userId_createdAt_idx" ON "HouseLedgerEntry"("userId", "createdAt");

DO $$
BEGIN
  ALTER TABLE "HouseLedgerEntry"
    ADD CONSTRAINT "HouseLedgerEntry_houseWalletId_fkey"
    FOREIGN KEY ("houseWalletId") REFERENCES "HouseWallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
