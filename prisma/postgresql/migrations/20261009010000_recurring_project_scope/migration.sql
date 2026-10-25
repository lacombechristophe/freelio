ALTER TABLE "RecurringInvoice" ADD COLUMN "projectId" TEXT;
ALTER TABLE "RecurringInvoice" ADD CONSTRAINT "RecurringInvoice_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "RecurringInvoice_companyId_projectId_idx" ON "RecurringInvoice"("companyId", "projectId");

-- Backfill only coherent historical references. Invalid JSON stays unchanged.
UPDATE "RecurringInvoice" AS r
SET "projectId" = p."id"
FROM "Project" AS p
WHERE r."projectId" IS NULL
  AND jsonb_typeof(r."template"->'projectId') = 'string'
  AND r."template"->>'projectId' = p."id"
  AND p."companyId" = r."companyId"
  AND p."clientId" = r."clientId";
