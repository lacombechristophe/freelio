CREATE TABLE "ClientPortalAccess" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "contactId" TEXT,
    "label" TEXT,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClientPortalAccess_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClientPortalMessage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClientPortalMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClientPortalAppointmentRequest" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "preferredStart" TIMESTAMP(3) NOT NULL,
    "alternativeStart" TIMESTAMP(3),
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "response" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClientPortalAppointmentRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClientPortalAccess_tokenHash_key" ON "ClientPortalAccess"("tokenHash");
CREATE INDEX "ClientPortalAccess_companyId_clientId_revokedAt_idx" ON "ClientPortalAccess"("companyId", "clientId", "revokedAt");
CREATE INDEX "ClientPortalAccess_expiresAt_idx" ON "ClientPortalAccess"("expiresAt");
CREATE INDEX "ClientPortalMessage_companyId_clientId_createdAt_idx" ON "ClientPortalMessage"("companyId", "clientId", "createdAt");
CREATE INDEX "ClientPortalMessage_companyId_direction_readAt_idx" ON "ClientPortalMessage"("companyId", "direction", "readAt");
CREATE INDEX "ClientPortalAppointmentRequest_company_client_status_start_idx" ON "ClientPortalAppointmentRequest"("companyId", "clientId", "status", "preferredStart");

ALTER TABLE "ClientPortalAccess" ADD CONSTRAINT "ClientPortalAccess_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientPortalAccess" ADD CONSTRAINT "ClientPortalAccess_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientPortalAccess" ADD CONSTRAINT "ClientPortalAccess_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClientPortalMessage" ADD CONSTRAINT "ClientPortalMessage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientPortalMessage" ADD CONSTRAINT "ClientPortalMessage_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientPortalAppointmentRequest" ADD CONSTRAINT "ClientPortalAppointmentRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientPortalAppointmentRequest" ADD CONSTRAINT "ClientPortalAppointmentRequest_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
