DO $$
DECLARE
  duplicate_count integer;
BEGIN
  SELECT COUNT(*)
  INTO duplicate_count
  FROM (
    SELECT "houseWalletId", "roundId", "userId", "type"
    FROM "HouseLedgerEntry"
    WHERE "roundId" IS NOT NULL
      AND "userId" IS NOT NULL
    GROUP BY 1, 2, 3, 4
    HAVING COUNT(*) > 1
  ) duplicates;

  IF duplicate_count > 0 THEN
    RAISE EXCEPTION
      'security_hardening_followup blocked: found % duplicate HouseLedgerEntry rows on (houseWalletId, roundId, userId, type); clean duplicates and rebalance HouseWallet before retrying',
      duplicate_count;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "LedgerEntry_referenceId_idx"
  ON "LedgerEntry"("referenceId");

CREATE UNIQUE INDEX IF NOT EXISTS "HouseLedgerEntry_houseWalletId_roundId_userId_type_key"
  ON "HouseLedgerEntry"("houseWalletId", "roundId", "userId", "type");

CREATE INDEX IF NOT EXISTS "RoundPlayer_roundId_currency_status_idx"
  ON "RoundPlayer"("roundId", "currency", "status");
