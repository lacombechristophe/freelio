ALTER TABLE "EmailThread" ADD COLUMN "serviceTicketId" TEXT;

CREATE TABLE "ServiceTicketNote" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorMembershipId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ServiceTicketNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmailThread_serviceTicketId_idx" ON "EmailThread"("serviceTicketId");
CREATE INDEX "ServiceTicketNote_companyId_createdAt_idx" ON "ServiceTicketNote"("companyId", "createdAt");
CREATE INDEX "ServiceTicketNote_ticketId_createdAt_idx" ON "ServiceTicketNote"("ticketId", "createdAt");
CREATE INDEX "ServiceTicketNote_authorMembershipId_idx" ON "ServiceTicketNote"("authorMembershipId");

ALTER TABLE "EmailThread" ADD CONSTRAINT "EmailThread_serviceTicketId_fkey" FOREIGN KEY ("serviceTicketId") REFERENCES "ServiceTicket"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ServiceTicketNote" ADD CONSTRAINT "ServiceTicketNote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceTicketNote" ADD CONSTRAINT "ServiceTicketNote_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "ServiceTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceTicketNote" ADD CONSTRAINT "ServiceTicketNote_authorMembershipId_fkey" FOREIGN KEY ("authorMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
