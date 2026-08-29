CREATE TABLE "ServiceDiagnosticGuide" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "productCategory" TEXT,
  "manufacturer" TEXT,
  "modelPattern" TEXT,
  "symptom" TEXT NOT NULL,
  "keywords" JSONB,
  "steps" JSONB NOT NULL,
  "resolutionHints" JSONB,
  "warrantyInstructions" TEXT,
  "outOfWarrantyInstructions" TEXT,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ServiceDiagnosticGuide_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ServiceTicketDiagnostic" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "guideId" TEXT,
  "performedByMembershipId" TEXT,
  "guideSnapshot" JSONB NOT NULL,
  "completedStepIds" JSONB NOT NULL,
  "warrantyStatus" TEXT NOT NULL,
  "symptom" TEXT NOT NULL,
  "outcome" TEXT NOT NULL,
  "recommendedAction" TEXT,
  "status" TEXT NOT NULL DEFAULT 'COMPLETED',
  "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ServiceTicketDiagnostic_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ServiceDiagnosticGuide_companyId_name_key"
  ON "ServiceDiagnosticGuide"("companyId", "name");

CREATE INDEX "ServiceDiagnosticGuide_companyId_status_priority_idx"
  ON "ServiceDiagnosticGuide"("companyId", "status", "priority");

CREATE INDEX "ServiceTicketDiagnostic_companyId_completedAt_idx"
  ON "ServiceTicketDiagnostic"("companyId", "completedAt");

CREATE INDEX "ServiceTicketDiagnostic_ticketId_completedAt_idx"
  ON "ServiceTicketDiagnostic"("ticketId", "completedAt");

CREATE INDEX "ServiceTicketDiagnostic_guideId_idx"
  ON "ServiceTicketDiagnostic"("guideId");

CREATE INDEX "ServiceTicketDiagnostic_performedByMembershipId_idx"
  ON "ServiceTicketDiagnostic"("performedByMembershipId");

ALTER TABLE "ServiceDiagnosticGuide"
  ADD CONSTRAINT "ServiceDiagnosticGuide_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ServiceTicketDiagnostic"
  ADD CONSTRAINT "ServiceTicketDiagnostic_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ServiceTicketDiagnostic"
  ADD CONSTRAINT "ServiceTicketDiagnostic_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "ServiceTicket"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ServiceTicketDiagnostic"
  ADD CONSTRAINT "ServiceTicketDiagnostic_guideId_fkey"
  FOREIGN KEY ("guideId") REFERENCES "ServiceDiagnosticGuide"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ServiceTicketDiagnostic"
  ADD CONSTRAINT "ServiceTicketDiagnostic_performedByMembershipId_fkey"
  FOREIGN KEY ("performedByMembershipId") REFERENCES "Membership"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
