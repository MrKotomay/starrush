UPDATE "HouseWallet"
SET "balance" = GREATEST("balance", 0);

DO $$
BEGIN
  ALTER TABLE "HouseWallet"
    ADD CONSTRAINT "HouseWallet_balance_non_negative_chk"
    CHECK ("balance" >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
