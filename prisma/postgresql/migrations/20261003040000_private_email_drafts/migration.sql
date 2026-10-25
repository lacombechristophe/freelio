CREATE TABLE "EmailDraft" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "authorUserId" TEXT NOT NULL,
  "createKey" TEXT NOT NULL,
  "requestKey" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "channelId" TEXT,
  "contactId" TEXT,
  "threadId" TEXT,
  "subject" TEXT NOT NULL DEFAULT '',
  "bodyHtml" TEXT NOT NULL DEFAULT '',
  "cc" JSONB NOT NULL,
  "bcc" JSONB NOT NULL,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmailDraft_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EmailDraft_companyId_authorUserId_createKey_key" ON "EmailDraft"("companyId", "authorUserId", "createKey");
CREATE UNIQUE INDEX "EmailDraft_companyId_requestKey_key" ON "EmailDraft"("companyId", "requestKey");
CREATE INDEX "EmailDraft_companyId_authorUserId_sentAt_updatedAt_idx" ON "EmailDraft"("companyId", "authorUserId", "sentAt", "updatedAt");
ALTER TABLE "EmailDraft" ADD CONSTRAINT "EmailDraft_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailDraft" ADD CONSTRAINT "EmailDraft_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
