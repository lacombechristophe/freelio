-- AlterTable
ALTER TABLE "CustomerSite" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Equipment" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "CustomerSite_companyId_archivedAt_idx" ON "CustomerSite"("companyId", "archivedAt");

-- CreateIndex
CREATE INDEX "Equipment_companyId_archivedAt_idx" ON "Equipment"("companyId", "archivedAt");
