ALTER TABLE "EmailDelivery"
ADD COLUMN "provider" TEXT,
ADD COLUMN "channelId" TEXT,
ADD COLUMN "providerDraftId" TEXT,
ADD COLUMN "providerMessageId" TEXT,
ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "maxAttempts" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN "nextAttemptAt" TIMESTAMP(3),
ADD COLUMN "lastAttemptAt" TIMESTAMP(3),
ADD COLUMN "lastEventAt" TIMESTAMP(3),
ADD COLUMN "deadLetteredAt" TIMESTAMP(3);

ALTER TABLE "EmailMessage"
ADD COLUMN "lastEventAt" TIMESTAMP(3);

ALTER TABLE "EmailDelivery"
ADD CONSTRAINT "EmailDelivery_channelId_fkey"
FOREIGN KEY ("channelId") REFERENCES "CommunicationChannel"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "EmailDelivery_status_nextAttemptAt_idx"
ON "EmailDelivery"("status", "nextAttemptAt");

CREATE TABLE "EmailSuppression" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "provider" TEXT,
  "providerEventId" TEXT,
  "details" JSONB,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "suppressedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "clearedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EmailSuppression_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "EmailSuppression"
ADD CONSTRAINT "EmailSuppression_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "EmailSuppression_companyId_email_key"
ON "EmailSuppression"("companyId", "email");

CREATE INDEX "EmailSuppression_companyId_active_suppressedAt_idx"
ON "EmailSuppression"("companyId", "active", "suppressedAt");

CREATE TABLE "ProcessorLease" (
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "leaseUntil" TIMESTAMP(3) NOT NULL,
    "lastStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSucceededAt" TIMESTAMP(3),
    "lastFailedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProcessorLease_pkey" PRIMARY KEY ("name")
);

CREATE INDEX "ProcessorLease_leaseUntil_idx"
ON "ProcessorLease"("leaseUntil");
