ALTER TABLE "EmailSequence" ADD COLUMN "campaignId" TEXT;

CREATE TABLE "MarketingCampaign" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "segmentId" TEXT,
  "ownerMembershipId" TEXT,
  "name" TEXT NOT NULL,
  "objective" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "channels" JSONB NOT NULL,
  "startAt" TIMESTAMP(3),
  "endAt" TIMESTAMP(3),
  "budgetCents" INTEGER NOT NULL DEFAULT 0,
  "utmCampaign" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketingCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketingCampaignAsset" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "ownerMembershipId" TEXT,
  "type" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'TODO',
  "url" TEXT,
  "dueAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketingCampaignAsset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketingCampaign_companyId_name_key" ON "MarketingCampaign"("companyId", "name");
CREATE INDEX "MarketingCampaign_companyId_status_startAt_idx" ON "MarketingCampaign"("companyId", "status", "startAt");
CREATE INDEX "MarketingCampaign_segmentId_idx" ON "MarketingCampaign"("segmentId");
CREATE INDEX "MarketingCampaign_ownerMembershipId_idx" ON "MarketingCampaign"("ownerMembershipId");
CREATE INDEX "MarketingCampaignAsset_campaignId_status_idx" ON "MarketingCampaignAsset"("campaignId", "status");
CREATE INDEX "MarketingCampaignAsset_ownerMembershipId_dueAt_idx" ON "MarketingCampaignAsset"("ownerMembershipId", "dueAt");
CREATE INDEX "EmailSequence_campaignId_idx" ON "EmailSequence"("campaignId");

ALTER TABLE "MarketingCampaign" ADD CONSTRAINT "MarketingCampaign_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingCampaign" ADD CONSTRAINT "MarketingCampaign_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "MarketingSegment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MarketingCampaign" ADD CONSTRAINT "MarketingCampaign_ownerMembershipId_fkey" FOREIGN KEY ("ownerMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MarketingCampaignAsset" ADD CONSTRAINT "MarketingCampaignAsset_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingCampaignAsset" ADD CONSTRAINT "MarketingCampaignAsset_ownerMembershipId_fkey" FOREIGN KEY ("ownerMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmailSequence" ADD CONSTRAINT "EmailSequence_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
