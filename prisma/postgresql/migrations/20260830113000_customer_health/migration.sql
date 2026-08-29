ALTER TABLE "Client"
  ADD COLUMN "successOwnerMembershipId" TEXT,
  ADD COLUMN "renewalAt" TIMESTAMP(3),
  ADD COLUMN "renewalAmountCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "successPlan" TEXT,
  ADD COLUMN "expansionNotes" TEXT,
  ADD COLUMN "healthLastComputedAt" TIMESTAMP(3);

CREATE TABLE "CustomerHealthRule" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "metric" TEXT NOT NULL,
  "operator" TEXT NOT NULL,
  "threshold" DOUBLE PRECISION NOT NULL,
  "impact" INTEGER NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CustomerHealthRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerHealthSnapshot" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "score" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "factors" JSONB NOT NULL,
  "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CustomerHealthSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Client_companyId_relationScore_idx" ON "Client"("companyId", "relationScore");
CREATE INDEX "Client_successOwnerMembershipId_idx" ON "Client"("successOwnerMembershipId");
CREATE INDEX "Client_renewalAt_idx" ON "Client"("renewalAt");
CREATE UNIQUE INDEX "CustomerHealthRule_companyId_name_key" ON "CustomerHealthRule"("companyId", "name");
CREATE INDEX "CustomerHealthRule_companyId_status_priority_idx" ON "CustomerHealthRule"("companyId", "status", "priority");
CREATE INDEX "CustomerHealthSnapshot_companyId_computedAt_idx" ON "CustomerHealthSnapshot"("companyId", "computedAt");
CREATE INDEX "CustomerHealthSnapshot_clientId_computedAt_idx" ON "CustomerHealthSnapshot"("clientId", "computedAt");

ALTER TABLE "Client"
  ADD CONSTRAINT "Client_successOwnerMembershipId_fkey"
  FOREIGN KEY ("successOwnerMembershipId") REFERENCES "Membership"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CustomerHealthRule"
  ADD CONSTRAINT "CustomerHealthRule_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerHealthSnapshot"
  ADD CONSTRAINT "CustomerHealthSnapshot_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerHealthSnapshot"
  ADD CONSTRAINT "CustomerHealthSnapshot_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
