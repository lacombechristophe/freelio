ALTER TABLE "FieldIntervention"
ADD COLUMN "customerSignatureData" TEXT;

CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

ALTER TABLE "Expense"
ADD COLUMN "interventionId" TEXT,
ADD COLUMN "sourceId" TEXT,
ADD COLUMN "notes" TEXT;

CREATE TABLE "InterventionReservation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "interventionId" TEXT NOT NULL,
    "sourceId" TEXT,
    "title" TEXT NOT NULL,
    "details" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'MINOR',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "dueAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InterventionReservation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Expense_interventionId_sourceId_key" ON "Expense"("interventionId", "sourceId");
CREATE INDEX "Expense_interventionId_idx" ON "Expense"("interventionId");
CREATE UNIQUE INDEX "InterventionReservation_interventionId_sourceId_key" ON "InterventionReservation"("interventionId", "sourceId");
CREATE INDEX "InterventionReservation_companyId_status_createdAt_idx" ON "InterventionReservation"("companyId", "status", "createdAt");
CREATE INDEX "InterventionReservation_interventionId_status_idx" ON "InterventionReservation"("interventionId", "status");

ALTER TABLE "Expense" ADD CONSTRAINT "Expense_interventionId_fkey" FOREIGN KEY ("interventionId") REFERENCES "FieldIntervention"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InterventionReservation" ADD CONSTRAINT "InterventionReservation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InterventionReservation" ADD CONSTRAINT "InterventionReservation_interventionId_fkey" FOREIGN KEY ("interventionId") REFERENCES "FieldIntervention"("id") ON DELETE CASCADE ON UPDATE CASCADE;
