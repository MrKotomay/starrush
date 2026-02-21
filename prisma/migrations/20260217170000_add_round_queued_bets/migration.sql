CREATE TABLE IF NOT EXISTS "RoundQueuedBet" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "currency" "Currency" NOT NULL,
  "betAmount" DECIMAL(20,9) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RoundQueuedBet_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RoundQueuedBet_userId_key" ON "RoundQueuedBet"("userId");
CREATE INDEX IF NOT EXISTS "RoundQueuedBet_createdAt_idx" ON "RoundQueuedBet"("createdAt");
CREATE INDEX IF NOT EXISTS "RoundQueuedBet_currency_createdAt_idx" ON "RoundQueuedBet"("currency", "createdAt");

DO $$
BEGIN
  ALTER TABLE "RoundQueuedBet"
    ADD CONSTRAINT "RoundQueuedBet_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
