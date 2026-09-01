DROP INDEX IF EXISTS "Pipeline_companyId_key";

ALTER TABLE "Pipeline"
  ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "Pipeline"
SET "isDefault" = true;

CREATE UNIQUE INDEX "Pipeline_companyId_name_key" ON "Pipeline"("companyId", "name");
CREATE UNIQUE INDEX "Pipeline_one_default_per_company_key" ON "Pipeline"("companyId") WHERE "isDefault" = true;
CREATE INDEX "Pipeline_companyId_isDefault_position_idx" ON "Pipeline"("companyId", "isDefault", "position");
