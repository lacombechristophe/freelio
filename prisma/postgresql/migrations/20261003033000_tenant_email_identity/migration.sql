DROP INDEX "EmailMessage_provider_providerId_key";
CREATE UNIQUE INDEX "EmailMessage_companyId_provider_providerId_key" ON "EmailMessage"("companyId", "provider", "providerId");
DROP INDEX "EmailEvent_providerEventId_key";
CREATE UNIQUE INDEX "EmailEvent_companyId_providerEventId_key" ON "EmailEvent"("companyId", "providerEventId");
