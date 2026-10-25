-- AlterTable
ALTER TABLE "EmailSequenceEnrollment" ADD COLUMN     "marketingAuthorization" JSONB;

-- CreateTable
CREATE TABLE "CampaignAudience" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "campaignVersion" INTEGER NOT NULL,
    "campaignHash" TEXT NOT NULL,
    "sequenceHash" TEXT NOT NULL,
    "configuration" JSONB NOT NULL,
    "segmentUpdatedAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "version" INTEGER NOT NULL DEFAULT 1,
    "total" INTEGER NOT NULL DEFAULT 0,
    "eligible" INTEGER NOT NULL DEFAULT 0,
    "excluded" INTEGER NOT NULL DEFAULT 0,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "enrolled" INTEGER NOT NULL DEFAULT 0,
    "existing" INTEGER NOT NULL DEFAULT 0,
    "rejected" INTEGER NOT NULL DEFAULT 0,
    "afterMemberId" TEXT,
    "errorCode" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "closedByUserId" TEXT,
    "closureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignAudience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignAudienceMember" (
    "id" TEXT NOT NULL,
    "audienceId" TEXT NOT NULL,
    "leadCaptureId" TEXT NOT NULL,
    "contactId" TEXT,
    "recipientEmail" TEXT,
    "name" TEXT NOT NULL,
    "authorization" JSONB,
    "decision" TEXT NOT NULL,
    "reason" TEXT,
    "result" TEXT NOT NULL DEFAULT 'PENDING',
    "resultReason" TEXT,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "CampaignAudienceMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampaignAudience_companyId_campaignId_createdAt_idx" ON "CampaignAudience"("companyId", "campaignId", "createdAt");

-- CreateIndex
CREATE INDEX "CampaignAudience_status_updatedAt_idx" ON "CampaignAudience"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "CampaignAudienceMember_audienceId_id_idx" ON "CampaignAudienceMember"("audienceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignAudienceMember_audienceId_leadCaptureId_key" ON "CampaignAudienceMember"("audienceId", "leadCaptureId");

-- AddForeignKey
ALTER TABLE "CampaignAudience" ADD CONSTRAINT "CampaignAudience_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignAudience" ADD CONSTRAINT "CampaignAudience_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignAudienceMember" ADD CONSTRAINT "CampaignAudienceMember_audienceId_fkey" FOREIGN KEY ("audienceId") REFERENCES "CampaignAudience"("id") ON DELETE CASCADE ON UPDATE CASCADE;
