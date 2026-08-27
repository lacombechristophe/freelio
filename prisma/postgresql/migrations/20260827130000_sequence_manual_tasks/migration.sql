ALTER TABLE "EmailSequenceStep"
ADD COLUMN "type" TEXT NOT NULL DEFAULT 'EMAIL',
ADD COLUMN "taskTitle" TEXT,
ADD COLUMN "taskNotes" TEXT,
ADD COLUMN "taskPriority" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN "pauseUntilComplete" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "EmailSequenceStep"
ADD CONSTRAINT "EmailSequenceStep_task_priority_check" CHECK ("taskPriority" >= 1 AND "taskPriority" <= 3);

CREATE TABLE "EmailSequenceTask" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "organisationTaskId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmailSequenceTask_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailSequenceTask_organisationTaskId_key" ON "EmailSequenceTask"("organisationTaskId");
CREATE UNIQUE INDEX "EmailSequenceTask_enrollmentId_stepId_key" ON "EmailSequenceTask"("enrollmentId", "stepId");
CREATE INDEX "EmailSequenceTask_companyId_createdAt_idx" ON "EmailSequenceTask"("companyId", "createdAt");
CREATE INDEX "EmailSequenceTask_stepId_idx" ON "EmailSequenceTask"("stepId");

ALTER TABLE "EmailSequenceTask" ADD CONSTRAINT "EmailSequenceTask_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailSequenceTask" ADD CONSTRAINT "EmailSequenceTask_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "EmailSequenceEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailSequenceTask" ADD CONSTRAINT "EmailSequenceTask_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "EmailSequenceStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailSequenceTask" ADD CONSTRAINT "EmailSequenceTask_organisationTaskId_fkey" FOREIGN KEY ("organisationTaskId") REFERENCES "OrganisationTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
