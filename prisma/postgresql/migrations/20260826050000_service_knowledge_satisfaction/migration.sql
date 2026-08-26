CREATE TABLE "KnowledgeArticle" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "summary" TEXT,
    "bodyHtml" TEXT NOT NULL,
    "category" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "visibility" TEXT NOT NULL DEFAULT 'INTERNAL',
    "tags" JSONB,
    "authorMembershipId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeArticle_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SatisfactionSurvey" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'CSAT',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "question" TEXT NOT NULL,
    "scaleMin" INTEGER NOT NULL DEFAULT 1,
    "scaleMax" INTEGER NOT NULL DEFAULT 5,
    "followUpQuestion" TEXT,
    "triggerEvent" TEXT NOT NULL DEFAULT 'TICKET_CLOSED',
    "delayHours" INTEGER NOT NULL DEFAULT 2,
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SatisfactionSurvey_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SatisfactionRequest" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "contactId" TEXT,
    "serviceTicketId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "channel" TEXT NOT NULL DEFAULT 'LINK',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "score" INTEGER,
    "comment" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SatisfactionRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "KnowledgeArticle_companyId_slug_key" ON "KnowledgeArticle"("companyId", "slug");
CREATE INDEX "KnowledgeArticle_companyId_status_visibility_idx" ON "KnowledgeArticle"("companyId", "status", "visibility");
CREATE INDEX "KnowledgeArticle_companyId_category_idx" ON "KnowledgeArticle"("companyId", "category");
CREATE INDEX "KnowledgeArticle_authorMembershipId_idx" ON "KnowledgeArticle"("authorMembershipId");

CREATE UNIQUE INDEX "SatisfactionSurvey_companyId_name_key" ON "SatisfactionSurvey"("companyId", "name");
CREATE INDEX "SatisfactionSurvey_companyId_status_type_idx" ON "SatisfactionSurvey"("companyId", "status", "type");

CREATE UNIQUE INDEX "SatisfactionRequest_tokenHash_key" ON "SatisfactionRequest"("tokenHash");
CREATE INDEX "SatisfactionRequest_companyId_status_createdAt_idx" ON "SatisfactionRequest"("companyId", "status", "createdAt");
CREATE INDEX "SatisfactionRequest_surveyId_respondedAt_idx" ON "SatisfactionRequest"("surveyId", "respondedAt");
CREATE INDEX "SatisfactionRequest_clientId_createdAt_idx" ON "SatisfactionRequest"("clientId", "createdAt");
CREATE INDEX "SatisfactionRequest_serviceTicketId_idx" ON "SatisfactionRequest"("serviceTicketId");
CREATE INDEX "SatisfactionRequest_contactId_idx" ON "SatisfactionRequest"("contactId");
CREATE INDEX "SatisfactionRequest_expiresAt_status_idx" ON "SatisfactionRequest"("expiresAt", "status");

ALTER TABLE "KnowledgeArticle" ADD CONSTRAINT "KnowledgeArticle_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgeArticle" ADD CONSTRAINT "KnowledgeArticle_authorMembershipId_fkey" FOREIGN KEY ("authorMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SatisfactionSurvey" ADD CONSTRAINT "SatisfactionSurvey_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SatisfactionRequest" ADD CONSTRAINT "SatisfactionRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SatisfactionRequest" ADD CONSTRAINT "SatisfactionRequest_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "SatisfactionSurvey"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SatisfactionRequest" ADD CONSTRAINT "SatisfactionRequest_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SatisfactionRequest" ADD CONSTRAINT "SatisfactionRequest_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SatisfactionRequest" ADD CONSTRAINT "SatisfactionRequest_serviceTicketId_fkey" FOREIGN KEY ("serviceTicketId") REFERENCES "ServiceTicket"("id") ON DELETE SET NULL ON UPDATE CASCADE;
