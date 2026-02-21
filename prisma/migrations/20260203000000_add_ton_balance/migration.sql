-- Add TON balance to users
ALTER TABLE "User"
ADD COLUMN "tonBalance" DECIMAL(20,9) NOT NULL DEFAULT 0;
