ALTER TABLE "LeadCapture" ADD COLUMN "score" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LeadCapture" ADD COLUMN "scoreBreakdown" JSONB;
ALTER TABLE "LeadCapture" ADD COLUMN "scoreUpdatedAt" TIMESTAMP(3);

CREATE TABLE "LeadScoringRule" (
  "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "name" TEXT NOT NULL, "field" TEXT NOT NULL,
  "operator" TEXT NOT NULL, "value" TEXT NOT NULL, "points" INTEGER NOT NULL, "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LeadScoringRule_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "MarketingSegment" (
  "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT, "kind" TEXT NOT NULL DEFAULT 'ACTIVE',
  "filters" JSONB NOT NULL, "status" TEXT NOT NULL DEFAULT 'ACTIVE', "lastBuiltAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketingSegment_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "MarketingSegmentMember" (
  "id" TEXT NOT NULL, "segmentId" TEXT NOT NULL, "leadCaptureId" TEXT NOT NULL, "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketingSegmentMember_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LeadScoringRule_companyId_name_key" ON "LeadScoringRule"("companyId", "name");
CREATE INDEX "LeadScoringRule_companyId_status_idx" ON "LeadScoringRule"("companyId", "status");
CREATE UNIQUE INDEX "MarketingSegment_companyId_name_key" ON "MarketingSegment"("companyId", "name");
CREATE INDEX "MarketingSegment_companyId_status_idx" ON "MarketingSegment"("companyId", "status");
CREATE UNIQUE INDEX "MarketingSegmentMember_segmentId_leadCaptureId_key" ON "MarketingSegmentMember"("segmentId", "leadCaptureId");
CREATE INDEX "MarketingSegmentMember_leadCaptureId_idx" ON "MarketingSegmentMember"("leadCaptureId");
ALTER TABLE "LeadScoringRule" ADD CONSTRAINT "LeadScoringRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingSegment" ADD CONSTRAINT "MarketingSegment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingSegmentMember" ADD CONSTRAINT "MarketingSegmentMember_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "MarketingSegment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingSegmentMember" ADD CONSTRAINT "MarketingSegmentMember_leadCaptureId_fkey" FOREIGN KEY ("leadCaptureId") REFERENCES "LeadCapture"("id") ON DELETE CASCADE ON UPDATE CASCADE;
