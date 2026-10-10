ALTER TABLE "MarketingCampaign" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "MarketingCampaign" ADD COLUMN "audienceLockedAt" TIMESTAMP(3);
ALTER TABLE "MarketingCampaignAsset" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
UPDATE "MarketingCampaign" AS c SET "audienceLockedAt" = (
  SELECT MIN(e."enrolledAt") FROM "EmailSequenceEnrollment" e
  JOIN "EmailSequence" s ON s."id" = e."sequenceId"
  WHERE s."campaignId" = c."id" AND s."companyId" = c."companyId"
) WHERE EXISTS (
  SELECT 1 FROM "EmailSequenceEnrollment" e
  JOIN "EmailSequence" s ON s."id" = e."sequenceId"
  WHERE s."campaignId" = c."id" AND s."companyId" = c."companyId"
);
