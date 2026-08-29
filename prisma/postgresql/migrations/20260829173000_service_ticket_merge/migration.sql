ALTER TABLE "ServiceTicket"
  ADD COLUMN "mergedIntoTicketId" TEXT,
  ADD COLUMN "preMergeStatus" TEXT,
  ADD COLUMN "mergedAt" TIMESTAMP(3);

ALTER TABLE "ServiceTicket"
  ADD CONSTRAINT "ServiceTicket_mergedIntoTicketId_fkey"
  FOREIGN KEY ("mergedIntoTicketId") REFERENCES "ServiceTicket"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ServiceTicket_companyId_mergedIntoTicketId_idx"
  ON "ServiceTicket"("companyId", "mergedIntoTicketId");
