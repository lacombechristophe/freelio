ALTER TABLE "InvoiceReminder"
ADD COLUMN "sourceKey" TEXT,
ADD COLUMN "error" TEXT,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "InvoiceReminder_invoiceId_sourceKey_key"
ON "InvoiceReminder"("invoiceId", "sourceKey");

ALTER TABLE "RelanceConfig"
ADD COLUMN "lastProcessedAt" TIMESTAMP(3);

CREATE INDEX "RelanceConfig_enabled_lastProcessedAt_idx"
ON "RelanceConfig"("enabled", "lastProcessedAt");
