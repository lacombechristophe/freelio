ALTER TABLE "MaintenanceContract"
  ADD COLUMN "noticeDays" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN "indexationRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "autoRenew" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "renewalStatus" TEXT NOT NULL DEFAULT 'NOT_DUE',
  ADD COLUMN "renewalNotes" TEXT,
  ADD COLUMN "renewedAt" TIMESTAMP(3),
  ADD COLUMN "renewedFromId" TEXT;

CREATE INDEX "MaintenanceContract_companyId_renewalStatus_endDate_idx"
  ON "MaintenanceContract"("companyId", "renewalStatus", "endDate");

CREATE INDEX "MaintenanceContract_renewedFromId_idx"
  ON "MaintenanceContract"("renewedFromId");

ALTER TABLE "MaintenanceContract"
  ADD CONSTRAINT "MaintenanceContract_renewedFromId_fkey"
  FOREIGN KEY ("renewedFromId") REFERENCES "MaintenanceContract"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
