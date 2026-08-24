ALTER TABLE "Opportunity"
ADD COLUMN "closedAt" TIMESTAMP(3),
ADD COLUMN "ownerMembershipId" TEXT;

CREATE INDEX "Opportunity_ownerMembershipId_status_idx"
ON "Opportunity"("ownerMembershipId", "status");

CREATE INDEX "Opportunity_pipelineId_status_closeDate_idx"
ON "Opportunity"("pipelineId", "status", "closeDate");

ALTER TABLE "Opportunity"
ADD CONSTRAINT "Opportunity_ownerMembershipId_fkey"
FOREIGN KEY ("ownerMembershipId") REFERENCES "Membership"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
