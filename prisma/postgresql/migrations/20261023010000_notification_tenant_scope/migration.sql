-- Historical notifications have no reliable tenant metadata. Keep them
-- unattributed; titles and the user's current membership cannot prove origin.
ALTER TABLE "Notification" ADD COLUMN "companyId" TEXT;
CREATE INDEX "Notification_companyId_userId_createdAt_idx" ON "Notification"("companyId", "userId", "createdAt");
CREATE INDEX "Notification_companyId_userId_isRead_idx" ON "Notification"("companyId", "userId", "isRead");
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
