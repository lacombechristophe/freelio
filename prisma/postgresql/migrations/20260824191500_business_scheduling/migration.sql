-- Extend field service scheduling with maintenance contract provenance.
ALTER TABLE "FieldIntervention"
ADD COLUMN "maintenanceContractId" TEXT,
ADD COLUMN "maintenanceScheduledFor" TIMESTAMP(3);

-- Maintenance contracts can provision their recurring billing template.
ALTER TABLE "MaintenanceContract"
ADD COLUMN "autoInvoice" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "invoiceDueDays" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN "tvaRate" DOUBLE PRECISION NOT NULL DEFAULT 20;

ALTER TABLE "RecurringInvoice"
ADD COLUMN "maintenanceContractId" TEXT;

-- Existing occurrences predate explicit idempotency keys. Their creation date is
-- the best available representation of the historical scheduled occurrence.
ALTER TABLE "RecurringInvoiceOccurrence"
ADD COLUMN "scheduledFor" TIMESTAMP(3);

WITH ranked_occurrences AS (
    SELECT
        "id",
        "date" + (ROW_NUMBER() OVER (
            PARTITION BY "recurringId", "date"
            ORDER BY "id"
        ) - 1) * INTERVAL '1 millisecond' AS "backfilledScheduledFor"
    FROM "RecurringInvoiceOccurrence"
    WHERE "scheduledFor" IS NULL
)
UPDATE "RecurringInvoiceOccurrence" AS occurrence
SET "scheduledFor" = ranked_occurrences."backfilledScheduledFor"
FROM ranked_occurrences
WHERE occurrence."id" = ranked_occurrences."id";

ALTER TABLE "RecurringInvoiceOccurrence"
ALTER COLUMN "scheduledFor" SET NOT NULL;

CREATE INDEX "FieldIntervention_maintenanceContractId_idx"
ON "FieldIntervention"("maintenanceContractId");

CREATE UNIQUE INDEX "FieldIntervention_maintenanceContractId_maintenanceSchedule_key"
ON "FieldIntervention"("maintenanceContractId", "maintenanceScheduledFor");

CREATE UNIQUE INDEX "RecurringInvoice_maintenanceContractId_key"
ON "RecurringInvoice"("maintenanceContractId");

CREATE UNIQUE INDEX "RecurringInvoiceOccurrence_recurringId_scheduledFor_key"
ON "RecurringInvoiceOccurrence"("recurringId", "scheduledFor");

ALTER TABLE "FieldIntervention"
ADD CONSTRAINT "FieldIntervention_maintenanceContractId_fkey"
FOREIGN KEY ("maintenanceContractId") REFERENCES "MaintenanceContract"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RecurringInvoice"
ADD CONSTRAINT "RecurringInvoice_maintenanceContractId_fkey"
FOREIGN KEY ("maintenanceContractId") REFERENCES "MaintenanceContract"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
