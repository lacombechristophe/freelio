ALTER TABLE "Contract" ADD COLUMN "maintenanceRenewalTerms" TEXT;
ALTER TABLE "MaintenanceContract" ADD COLUMN "currentRenewalProposalId" TEXT;
ALTER TABLE "MaintenanceContract" ADD COLUMN "acceptedRenewalProposalId" TEXT;
CREATE UNIQUE INDEX "MaintenanceContract_currentRenewalProposalId_key" ON "MaintenanceContract"("currentRenewalProposalId");
CREATE UNIQUE INDEX "MaintenanceContract_acceptedRenewalProposalId_key" ON "MaintenanceContract"("acceptedRenewalProposalId");
ALTER TABLE "MaintenanceContract" ADD CONSTRAINT "MaintenanceContract_currentRenewalProposalId_fkey" FOREIGN KEY ("currentRenewalProposalId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaintenanceContract" ADD CONSTRAINT "MaintenanceContract_acceptedRenewalProposalId_fkey" FOREIGN KEY ("acceptedRenewalProposalId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
