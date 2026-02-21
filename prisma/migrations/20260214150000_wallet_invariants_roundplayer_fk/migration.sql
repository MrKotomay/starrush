-- Normalize legacy rows before enforcing wallet invariants.
UPDATE "Wallet"
SET
  "balance" = GREATEST("balance", 0),
  "lockedBalance" = GREATEST("lockedBalance", 0);

UPDATE "Wallet"
SET "lockedBalance" = "balance"
WHERE "lockedBalance" > "balance";

ALTER TABLE "Wallet"
  ADD CONSTRAINT "Wallet_balance_non_negative_chk"
  CHECK ("balance" >= 0);

ALTER TABLE "Wallet"
  ADD CONSTRAINT "Wallet_lockedBalance_non_negative_chk"
  CHECK ("lockedBalance" >= 0);

ALTER TABLE "Wallet"
  ADD CONSTRAINT "Wallet_lockedBalance_lte_balance_chk"
  CHECK ("lockedBalance" <= "balance");

ALTER TABLE "RoundPlayer"
  ADD CONSTRAINT "RoundPlayer_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "RoundPlayer_userId_idx" ON "RoundPlayer"("userId");