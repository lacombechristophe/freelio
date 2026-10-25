-- New associations only. Do not infer historical imputations from titles or dates.
ALTER TABLE "OrganisationTask" ADD COLUMN "timeImputedAt" TIMESTAMP(3);
ALTER TABLE "TimeEntry" ADD COLUMN "sourceOrganisationTaskId" TEXT;
CREATE UNIQUE INDEX "TimeEntry_sourceOrganisationTaskId_key" ON "TimeEntry"("sourceOrganisationTaskId");
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_sourceOrganisationTaskId_fkey"
  FOREIGN KEY ("sourceOrganisationTaskId") REFERENCES "OrganisationTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
