ALTER TABLE "EmailDraft"
ADD COLUMN "scheduledAt" TIMESTAMP(3),
ADD COLUMN "scheduledTimezone" TEXT,
ADD COLUMN "scheduledPayload" JSONB,
ADD COLUMN "scheduleStatus" TEXT,
ADD COLUMN "scheduleAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "scheduleNextAttemptAt" TIMESTAMP(3),
ADD COLUMN "scheduleStartedAt" TIMESTAMP(3),
ADD COLUMN "scheduleError" TEXT;

CREATE INDEX "EmailDraft_scheduleStatus_scheduleNextAttemptAt_idx" ON "EmailDraft"("scheduleStatus", "scheduleNextAttemptAt");
