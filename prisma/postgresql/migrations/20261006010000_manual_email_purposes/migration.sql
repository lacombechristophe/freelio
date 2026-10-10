ALTER TABLE "MarketingConsent" ADD COLUMN "recipientEmail" TEXT;
ALTER TABLE "EmailDraft" ADD COLUMN "purpose" TEXT;
ALTER TABLE "EmailDelivery" ADD COLUMN "purpose" TEXT;
ALTER TABLE "EmailMessage" ADD COLUMN "purpose" TEXT;
CREATE INDEX "MarketingConsent_recipient_purpose_capturedAt_idx"
ON "MarketingConsent"("companyId", "recipientEmail", "channel", "purpose", "capturedAt");
