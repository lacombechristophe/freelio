ALTER TABLE "Project"
ADD COLUMN "projectTemplateId" TEXT;

ALTER TABLE "ProjectMilestone"
ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'MILESTONE',
ADD COLUMN "plannedStartAt" TIMESTAMP(3),
ADD COLUMN "durationDays" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "templateStepId" TEXT,
ADD COLUMN "dependsOnId" TEXT,
ADD COLUMN "assignedMembershipId" TEXT;

CREATE TABLE "ProjectTemplate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "worksiteType" TEXT,
    "defaultBudgetCents" INTEGER NOT NULL DEFAULT 0,
    "defaultDurationDays" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProjectTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectTemplateStep" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'MILESTONE',
    "offsetDays" INTEGER NOT NULL DEFAULT 0,
    "durationDays" INTEGER NOT NULL DEFAULT 1,
    "order" INTEGER NOT NULL DEFAULT 0,
    "dependsOnStepId" TEXT,
    CONSTRAINT "ProjectTemplateStep_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectTemplate_companyId_name_key" ON "ProjectTemplate"("companyId", "name");
CREATE INDEX "ProjectTemplate_companyId_active_idx" ON "ProjectTemplate"("companyId", "active");
CREATE UNIQUE INDEX "ProjectTemplateStep_templateId_title_key" ON "ProjectTemplateStep"("templateId", "title");
CREATE INDEX "ProjectTemplateStep_templateId_order_idx" ON "ProjectTemplateStep"("templateId", "order");
CREATE INDEX "ProjectTemplateStep_dependsOnStepId_idx" ON "ProjectTemplateStep"("dependsOnStepId");
CREATE INDEX "Project_projectTemplateId_idx" ON "Project"("projectTemplateId");
CREATE UNIQUE INDEX "ProjectMilestone_projectId_templateStepId_key" ON "ProjectMilestone"("projectId", "templateStepId");
CREATE INDEX "ProjectMilestone_projectId_order_idx" ON "ProjectMilestone"("projectId", "order");
CREATE INDEX "ProjectMilestone_dependsOnId_idx" ON "ProjectMilestone"("dependsOnId");
CREATE INDEX "ProjectMilestone_assignedMembershipId_plannedStartAt_idx" ON "ProjectMilestone"("assignedMembershipId", "plannedStartAt");

ALTER TABLE "ProjectTemplate" ADD CONSTRAINT "ProjectTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectTemplateStep" ADD CONSTRAINT "ProjectTemplateStep_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ProjectTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectTemplateStep" ADD CONSTRAINT "ProjectTemplateStep_dependsOnStepId_fkey" FOREIGN KEY ("dependsOnStepId") REFERENCES "ProjectTemplateStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_projectTemplateId_fkey" FOREIGN KEY ("projectTemplateId") REFERENCES "ProjectTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectMilestone" ADD CONSTRAINT "ProjectMilestone_templateStepId_fkey" FOREIGN KEY ("templateStepId") REFERENCES "ProjectTemplateStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectMilestone" ADD CONSTRAINT "ProjectMilestone_dependsOnId_fkey" FOREIGN KEY ("dependsOnId") REFERENCES "ProjectMilestone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectMilestone" ADD CONSTRAINT "ProjectMilestone_assignedMembershipId_fkey" FOREIGN KEY ("assignedMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
