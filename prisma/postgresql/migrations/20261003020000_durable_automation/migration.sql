ALTER TABLE "AutomationRun"
  ADD COLUMN "workflowVersion" INTEGER,
  ADD COLUMN "configuration" JSONB,
  ADD COLUMN "input" JSONB,
  ADD COLUMN "nextActionPosition" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "ownerId" TEXT,
  ADD COLUMN "leaseUntil" TIMESTAMP(3);

CREATE TABLE "AutomationEventOutbox" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "eventKey" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "subjectModel" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "AutomationEventOutbox_companyId_eventKey_key" ON "AutomationEventOutbox"("companyId", "eventKey");
CREATE INDEX "AutomationEventOutbox_status_nextAttemptAt_idx" ON "AutomationEventOutbox"("status", "nextAttemptAt");

CREATE TABLE "AutomationRunAction" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "runId" TEXT NOT NULL REFERENCES "AutomationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "position" INTEGER NOT NULL,
  "output" JSONB NOT NULL,
  "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "AutomationRunAction_runId_position_key" ON "AutomationRunAction"("runId", "position");

-- Preserve legacy active configurations as explicit published snapshots. New
-- runs cannot execute mutable workflow fields after this migration.
INSERT INTO "AutomationWorkflowVersion" ("id", "companyId", "workflowId", "version", "status", "trigger", "conditions", "actions", "publishedAt", "createdAt")
SELECT w."id" || '-baseline-' || (COALESCE(v."maxVersion", 0) + 1)::TEXT, w."companyId", w."id", COALESCE(v."maxVersion", 0) + 1,
  'PUBLISHED', w."trigger", w."conditions", w."actions", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "AutomationWorkflow" w LEFT JOIN (
  SELECT "workflowId", MAX("version") AS "maxVersion" FROM "AutomationWorkflowVersion" GROUP BY "workflowId"
) v ON v."workflowId" = w."id"
WHERE w."status" = 'ACTIVE' AND w."publishedVersion" IS NULL;
UPDATE "AutomationWorkflow" w SET "publishedVersion" = (
  SELECT MAX(v."version") FROM "AutomationWorkflowVersion" v WHERE v."workflowId" = w."id" AND v."status" = 'PUBLISHED'
) WHERE w."status" = 'ACTIVE' AND w."publishedVersion" IS NULL;

-- Historical RUNNING/FAILED records have no trustworthy checkpoint. They must
-- remain inspectable and must never be blindly re-executed by the new worker.
UPDATE "AutomationRun" SET "status" = 'FAILED', "error" = 'LEGACY_RUN_REQUIRES_RECONCILIATION', "completedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'RUNNING';
