CREATE TYPE "DepositProvider" AS ENUM ('TELEGRAM_STARS', 'TON_CONNECT');
CREATE TYPE "DepositStatus" AS ENUM ('CREATED', 'WAITING_PAYMENT', 'SUBMITTED', 'CONFIRMING', 'COMPLETED', 'FAILED', 'EXPIRED', 'CANCELED');

CREATE TABLE "DepositIntent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "DepositProvider" NOT NULL,
    "currency" "Currency" NOT NULL,
    "status" "DepositStatus" NOT NULL DEFAULT 'CREATED',
    "amount" DECIMAL(20,9) NOT NULL,
    "amountNano" BIGINT,
    "senderAddress" VARCHAR(128),
    "recipientAddress" VARCHAR(128),
    "providerPaymentId" VARCHAR(256),
    "providerExternalId" VARCHAR(256),
    "providerPayload" VARCHAR(256),
    "txHash" VARCHAR(256),
    "txBoc" TEXT,
    "ledgerReferenceId" VARCHAR(128) NOT NULL,
    "failureReason" VARCHAR(256),
    "metadata" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepositIntent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentProviderEvent" (
    "id" TEXT NOT NULL,
    "provider" "DepositProvider" NOT NULL,
    "eventId" VARCHAR(128) NOT NULL,
    "eventType" VARCHAR(64) NOT NULL,
    "intentId" TEXT,
    "status" VARCHAR(32) NOT NULL DEFAULT 'RECEIVED',
    "error" VARCHAR(256),
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentProviderEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GiftIngressEvent" (
    "id" TEXT NOT NULL,
    "providerEventId" VARCHAR(128),
    "telegramGiftId" VARCHAR(128),
    "fromTelegramId" BIGINT,
    "toTelegramId" BIGINT,
    "userId" TEXT,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GiftIngressEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserGiftStub" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "giftIngressEventId" TEXT NOT NULL,
    "giftType" VARCHAR(128) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserGiftStub_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DepositIntent_ledgerReferenceId_key" ON "DepositIntent"("ledgerReferenceId");
CREATE UNIQUE INDEX "DepositIntent_provider_providerPaymentId_key" ON "DepositIntent"("provider", "providerPaymentId");
CREATE UNIQUE INDEX "DepositIntent_provider_txHash_key" ON "DepositIntent"("provider", "txHash");
CREATE INDEX "DepositIntent_userId_createdAt_idx" ON "DepositIntent"("userId", "createdAt");
CREATE INDEX "DepositIntent_status_createdAt_idx" ON "DepositIntent"("status", "createdAt");
CREATE INDEX "DepositIntent_provider_status_createdAt_idx" ON "DepositIntent"("provider", "status", "createdAt");

CREATE UNIQUE INDEX "PaymentProviderEvent_provider_eventId_key" ON "PaymentProviderEvent"("provider", "eventId");
CREATE INDEX "PaymentProviderEvent_provider_eventType_createdAt_idx" ON "PaymentProviderEvent"("provider", "eventType", "createdAt");
CREATE INDEX "PaymentProviderEvent_intentId_createdAt_idx" ON "PaymentProviderEvent"("intentId", "createdAt");

CREATE UNIQUE INDEX "GiftIngressEvent_providerEventId_key" ON "GiftIngressEvent"("providerEventId");
CREATE INDEX "GiftIngressEvent_userId_createdAt_idx" ON "GiftIngressEvent"("userId", "createdAt");
CREATE INDEX "GiftIngressEvent_telegramGiftId_createdAt_idx" ON "GiftIngressEvent"("telegramGiftId", "createdAt");

CREATE INDEX "UserGiftStub_userId_createdAt_idx" ON "UserGiftStub"("userId", "createdAt");
CREATE UNIQUE INDEX "UserGiftStub_userId_giftIngressEventId_giftType_key" ON "UserGiftStub"("userId", "giftIngressEventId", "giftType");

ALTER TABLE "DepositIntent" ADD CONSTRAINT "DepositIntent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentProviderEvent" ADD CONSTRAINT "PaymentProviderEvent_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "DepositIntent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GiftIngressEvent" ADD CONSTRAINT "GiftIngressEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UserGiftStub" ADD CONSTRAINT "UserGiftStub_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserGiftStub" ADD CONSTRAINT "UserGiftStub_giftIngressEventId_fkey" FOREIGN KEY ("giftIngressEventId") REFERENCES "GiftIngressEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
