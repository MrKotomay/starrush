DO $$
BEGIN
  CREATE TYPE "FairnessVersion" AS ENUM ('LEGACY_HASH_V0', 'HMAC_SHA256_V1');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Round" ADD COLUMN IF NOT EXISTS "fairnessVersion" "FairnessVersion";
ALTER TABLE "Round" ADD COLUMN IF NOT EXISTS "fairnessNonce" INTEGER;
ALTER TABLE "Round" ADD COLUMN IF NOT EXISTS "clientSeed" VARCHAR(128);

UPDATE "Round"
SET "fairnessVersion" = 'LEGACY_HASH_V0'
WHERE "fairnessVersion" IS NULL;

UPDATE "Round"
SET "fairnessNonce" = 0
WHERE "fairnessNonce" IS NULL;

ALTER TABLE "Round" ALTER COLUMN "fairnessVersion" SET DEFAULT 'HMAC_SHA256_V1';
ALTER TABLE "Round" ALTER COLUMN "fairnessVersion" SET NOT NULL;
ALTER TABLE "Round" ALTER COLUMN "fairnessNonce" SET DEFAULT 0;
ALTER TABLE "Round" ALTER COLUMN "fairnessNonce" SET NOT NULL;