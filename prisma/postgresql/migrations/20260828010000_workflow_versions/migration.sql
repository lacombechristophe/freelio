ALTER TABLE "AutomationWorkflow" ADD COLUMN "publishedVersion" INTEGER;

CREATE TABLE "AutomationWorkflowVersion" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "trigger" TEXT NOT NULL,
    "conditions" JSONB,
    "actions" JSONB NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AutomationWorkflowVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AutomationWorkflowVersion_workflowId_version_key" ON "AutomationWorkflowVersion"("workflowId", "version");
CREATE INDEX "AutomationWorkflowVersion_companyId_createdAt_idx" ON "AutomationWorkflowVersion"("companyId", "createdAt");
CREATE INDEX "AutomationWorkflowVersion_workflowId_status_idx" ON "AutomationWorkflowVersion"("workflowId", "status");

ALTER TABLE "AutomationWorkflowVersion" ADD CONSTRAINT "AutomationWorkflowVersion_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationWorkflowVersion" ADD CONSTRAINT "AutomationWorkflowVersion_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "AutomationWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "AutomationWorkflowVersion" ("id", "companyId", "workflowId", "version", "status", "trigger", "conditions", "actions", "publishedAt", "createdAt")
SELECT CONCAT('awv_', "id"), "companyId", "id", 1,
  CASE WHEN "status" = 'ACTIVE' THEN 'PUBLISHED' ELSE 'DRAFT' END,
  "trigger", "conditions", "actions",
  CASE WHEN "status" = 'ACTIVE' THEN CURRENT_TIMESTAMP ELSE NULL END,
  CURRENT_TIMESTAMP
FROM "AutomationWorkflow";

UPDATE "AutomationWorkflow" SET "publishedVersion" = 1 WHERE "status" = 'ACTIVE';
