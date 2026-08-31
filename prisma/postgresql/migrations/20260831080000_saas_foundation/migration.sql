ALTER TABLE "User"
  ADD COLUMN "termsAcceptedAt" TIMESTAMP(3),
  ADD COLUMN "termsVersion" TEXT,
  ADD COLUMN "privacyAcceptedAt" TIMESTAMP(3),
  ADD COLUMN "privacyVersion" TEXT;

CREATE TABLE "SaasSubscription" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "plan" TEXT NOT NULL DEFAULT 'ALPHA',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "stripeCustomerId" TEXT,
  "stripeSubscriptionId" TEXT,
  "stripePriceId" TEXT,
  "seatQuantity" INTEGER NOT NULL DEFAULT 1,
  "trialEndsAt" TIMESTAMP(3),
  "currentPeriodEnd" TIMESTAMP(3),
  "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SaasSubscription_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SaasSubscription_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "BillingWebhookEvent" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PROCESSING',
  "payloadDigest" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 1,
  "lastError" TEXT,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillingWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SaasSubscription_companyId_key" ON "SaasSubscription"("companyId");
CREATE UNIQUE INDEX "SaasSubscription_stripeCustomerId_key" ON "SaasSubscription"("stripeCustomerId");
CREATE UNIQUE INDEX "SaasSubscription_stripeSubscriptionId_key" ON "SaasSubscription"("stripeSubscriptionId");
CREATE INDEX "SaasSubscription_status_currentPeriodEnd_idx" ON "SaasSubscription"("status", "currentPeriodEnd");
CREATE INDEX "BillingWebhookEvent_status_createdAt_idx" ON "BillingWebhookEvent"("status", "createdAt");
