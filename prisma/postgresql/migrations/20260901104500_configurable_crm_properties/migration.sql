CREATE TABLE "CrmPropertyDefinition" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "objectType" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "groupName" TEXT NOT NULL DEFAULT 'Informations complémentaires',
  "description" TEXT,
  "options" JSONB,
  "required" BOOLEAN NOT NULL DEFAULT false,
  "position" INTEGER NOT NULL DEFAULT 0,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrmPropertyDefinition_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CrmPropertyDefinition_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "CrmPropertyValue" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "definitionId" TEXT NOT NULL,
  "recordId" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrmPropertyValue_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CrmPropertyValue_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CrmPropertyValue_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "CrmPropertyDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "CrmPropertyHistory" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "definitionId" TEXT,
  "objectType" TEXT NOT NULL,
  "recordId" TEXT NOT NULL,
  "propertyKey" TEXT NOT NULL,
  "propertyLabel" TEXT NOT NULL,
  "previousValue" TEXT,
  "nextValue" TEXT,
  "changedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrmPropertyHistory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CrmPropertyHistory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CrmPropertyHistory_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "CrmPropertyDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CrmPropertyDefinition_companyId_objectType_key_key" ON "CrmPropertyDefinition"("companyId", "objectType", "key");
CREATE INDEX "CrmPropertyDefinition_companyId_objectType_archivedAt_position_idx" ON "CrmPropertyDefinition"("companyId", "objectType", "archivedAt", "position");
CREATE UNIQUE INDEX "CrmPropertyValue_definitionId_recordId_key" ON "CrmPropertyValue"("definitionId", "recordId");
CREATE INDEX "CrmPropertyValue_companyId_recordId_idx" ON "CrmPropertyValue"("companyId", "recordId");
CREATE INDEX "CrmPropertyHistory_companyId_objectType_recordId_createdAt_idx" ON "CrmPropertyHistory"("companyId", "objectType", "recordId", "createdAt");
CREATE INDEX "CrmPropertyHistory_definitionId_createdAt_idx" ON "CrmPropertyHistory"("definitionId", "createdAt");
