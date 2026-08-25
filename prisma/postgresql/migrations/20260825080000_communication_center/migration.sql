CREATE TABLE "CommunicationChannel" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "emailAddress" TEXT NOT NULL,
    "displayName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "credentialsEncrypted" TEXT,
    "config" JSONB,
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CommunicationChannel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailThread" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clientId" TEXT,
    "contactId" TEXT,
    "leadCaptureId" TEXT,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "assignedUserId" TEXT,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmailThread_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailMessage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "deliveryId" TEXT,
    "direction" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerId" TEXT,
    "internetMessageId" TEXT,
    "inReplyTo" TEXT,
    "fromAddress" TEXT NOT NULL,
    "toAddresses" JSONB NOT NULL,
    "ccAddresses" JSONB,
    "bccAddresses" JSONB,
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT,
    "bodyText" TEXT,
    "attachments" JSONB,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "sentAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "messageId" TEXT,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommunicationChannel_companyId_provider_emailAddress_key" ON "CommunicationChannel"("companyId", "provider", "emailAddress");
CREATE INDEX "CommunicationChannel_companyId_status_idx" ON "CommunicationChannel"("companyId", "status");
CREATE INDEX "CommunicationChannel_provider_emailAddress_idx" ON "CommunicationChannel"("provider", "emailAddress");
CREATE INDEX "EmailThread_companyId_status_lastMessageAt_idx" ON "EmailThread"("companyId", "status", "lastMessageAt");
CREATE INDEX "EmailThread_clientId_idx" ON "EmailThread"("clientId");
CREATE INDEX "EmailThread_contactId_idx" ON "EmailThread"("contactId");
CREATE INDEX "EmailThread_leadCaptureId_idx" ON "EmailThread"("leadCaptureId");
CREATE UNIQUE INDEX "EmailMessage_deliveryId_key" ON "EmailMessage"("deliveryId");
CREATE UNIQUE INDEX "EmailMessage_provider_providerId_key" ON "EmailMessage"("provider", "providerId");
CREATE INDEX "EmailMessage_companyId_createdAt_idx" ON "EmailMessage"("companyId", "createdAt");
CREATE INDEX "EmailMessage_threadId_createdAt_idx" ON "EmailMessage"("threadId", "createdAt");
CREATE INDEX "EmailMessage_internetMessageId_idx" ON "EmailMessage"("internetMessageId");
CREATE UNIQUE INDEX "EmailEvent_providerEventId_key" ON "EmailEvent"("providerEventId");
CREATE INDEX "EmailEvent_companyId_occurredAt_idx" ON "EmailEvent"("companyId", "occurredAt");
CREATE INDEX "EmailEvent_providerMessageId_idx" ON "EmailEvent"("providerMessageId");
CREATE INDEX "EmailEvent_messageId_occurredAt_idx" ON "EmailEvent"("messageId", "occurredAt");

ALTER TABLE "CommunicationChannel" ADD CONSTRAINT "CommunicationChannel_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailThread" ADD CONSTRAINT "EmailThread_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailThread" ADD CONSTRAINT "EmailThread_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmailThread" ADD CONSTRAINT "EmailThread_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmailThread" ADD CONSTRAINT "EmailThread_leadCaptureId_fkey" FOREIGN KEY ("leadCaptureId") REFERENCES "LeadCapture"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "EmailThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "EmailDelivery"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmailEvent" ADD CONSTRAINT "EmailEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailEvent" ADD CONSTRAINT "EmailEvent_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "EmailMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
