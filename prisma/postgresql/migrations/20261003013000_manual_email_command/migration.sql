ALTER TABLE "EmailDelivery" ADD COLUMN "requestKey" TEXT;
ALTER TABLE "EmailDelivery" ADD COLUMN "payload" JSONB;
ALTER TABLE "EmailDelivery" ADD COLUMN "firstAttemptAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "EmailDelivery_companyId_requestKey_key" ON "EmailDelivery"("companyId", "requestKey");
