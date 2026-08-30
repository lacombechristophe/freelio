ALTER TABLE "Contract"
  ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'STANDARD',
  ADD COLUMN "parentContractId" TEXT,
  ADD COLUMN "maintenanceContractId" TEXT,
  ADD COLUMN "amendmentReason" TEXT,
  ADD COLUMN "effectiveAt" TIMESTAMP(3);

CREATE TABLE "ContractAmendmentChange" (
  "id" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "previousValue" TEXT,
  "nextValue" TEXT NOT NULL,
  "financialImpactCents" INTEGER,
  "order" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContractAmendmentChange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Contract_companyId_kind_status_idx" ON "Contract"("companyId", "kind", "status");
CREATE INDEX "Contract_parentContractId_idx" ON "Contract"("parentContractId");
CREATE INDEX "Contract_maintenanceContractId_idx" ON "Contract"("maintenanceContractId");
CREATE INDEX "ContractAmendmentChange_contractId_order_idx" ON "ContractAmendmentChange"("contractId", "order");

ALTER TABLE "Contract"
  ADD CONSTRAINT "Contract_parentContractId_fkey"
  FOREIGN KEY ("parentContractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Contract"
  ADD CONSTRAINT "Contract_maintenanceContractId_fkey"
  FOREIGN KEY ("maintenanceContractId") REFERENCES "MaintenanceContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ContractAmendmentChange"
  ADD CONSTRAINT "ContractAmendmentChange_contractId_fkey"
  FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
