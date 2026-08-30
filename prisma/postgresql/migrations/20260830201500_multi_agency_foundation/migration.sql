CREATE TABLE "Agency" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'MIXED',
  "address" TEXT,
  "postalCode" TEXT,
  "city" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Agency_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgencyMembership" (
  "agencyId" TEXT NOT NULL,
  "membershipId" TEXT NOT NULL,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgencyMembership_pkey" PRIMARY KEY ("agencyId", "membershipId")
);

ALTER TABLE "CustomerSite" ADD COLUMN "agencyId" TEXT;
ALTER TABLE "Project" ADD COLUMN "agencyId" TEXT;
ALTER TABLE "Warehouse" ADD COLUMN "agencyId" TEXT;

CREATE UNIQUE INDEX "Agency_companyId_code_key" ON "Agency"("companyId", "code");
CREATE INDEX "Agency_companyId_active_name_idx" ON "Agency"("companyId", "active", "name");
CREATE INDEX "Agency_companyId_isDefault_idx" ON "Agency"("companyId", "isDefault");
CREATE UNIQUE INDEX "Agency_companyId_default_key" ON "Agency"("companyId") WHERE "isDefault" = true;
CREATE INDEX "AgencyMembership_membershipId_isPrimary_idx" ON "AgencyMembership"("membershipId", "isPrimary");
CREATE UNIQUE INDEX "AgencyMembership_membershipId_primary_key" ON "AgencyMembership"("membershipId") WHERE "isPrimary" = true;
CREATE INDEX "CustomerSite_companyId_agencyId_idx" ON "CustomerSite"("companyId", "agencyId");
CREATE INDEX "Project_companyId_agencyId_status_idx" ON "Project"("companyId", "agencyId", "status");
CREATE INDEX "Warehouse_companyId_agencyId_active_idx" ON "Warehouse"("companyId", "agencyId", "active");

ALTER TABLE "Agency"
  ADD CONSTRAINT "Agency_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AgencyMembership"
  ADD CONSTRAINT "AgencyMembership_agencyId_fkey"
  FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AgencyMembership"
  ADD CONSTRAINT "AgencyMembership_membershipId_fkey"
  FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerSite"
  ADD CONSTRAINT "CustomerSite_agencyId_fkey"
  FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Project"
  ADD CONSTRAINT "Project_agencyId_fkey"
  FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Warehouse"
  ADD CONSTRAINT "Warehouse_agencyId_fkey"
  FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "Agency" (
  "id", "companyId", "code", "name", "kind", "active", "isDefault", "createdAt", "updatedAt"
)
SELECT
  'agency_' || substr(md5("id"), 1, 20),
  "id",
  'PRINCIPALE',
  'Agence principale',
  'MIXED',
  true,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Company";

UPDATE "CustomerSite" AS site
SET "agencyId" = agency."id"
FROM "Agency" AS agency
WHERE agency."companyId" = site."companyId" AND agency."isDefault" = true;

UPDATE "Project" AS project
SET "agencyId" = agency."id"
FROM "Agency" AS agency
WHERE agency."companyId" = project."companyId" AND agency."isDefault" = true;

UPDATE "Warehouse" AS warehouse
SET "agencyId" = agency."id"
FROM "Agency" AS agency
WHERE agency."companyId" = warehouse."companyId" AND agency."isDefault" = true;

INSERT INTO "AgencyMembership" ("agencyId", "membershipId", "isPrimary", "createdAt")
SELECT agency."id", membership."id", true, CURRENT_TIMESTAMP
FROM "Membership" AS membership
JOIN "Agency" AS agency ON agency."companyId" = membership."companyId" AND agency."isDefault" = true;
