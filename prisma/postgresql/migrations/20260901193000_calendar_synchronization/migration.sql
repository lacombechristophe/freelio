ALTER TABLE "OrganisationTask"
  ADD COLUMN "calendarChannelId" TEXT,
  ADD COLUMN "calendarProvider" TEXT,
  ADD COLUMN "calendarExternalId" TEXT,
  ADD COLUMN "calendarEtag" TEXT,
  ADD COLUMN "calendarSyncStatus" TEXT,
  ADD COLUMN "calendarLastError" TEXT,
  ADD COLUMN "calendarLastSyncedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "OrganisationTask_companyId_calendarChannelId_calendarExternalId_key"
  ON "OrganisationTask"("companyId", "calendarChannelId", "calendarExternalId");

CREATE INDEX "OrganisationTask_companyId_calendarSyncStatus_idx"
  ON "OrganisationTask"("companyId", "calendarSyncStatus");
