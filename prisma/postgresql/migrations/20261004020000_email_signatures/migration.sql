CREATE TABLE "EmailSignature" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmailSignature_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailSignature_companyId_authorUserId_key" ON "EmailSignature"("companyId", "authorUserId");
ALTER TABLE "EmailSignature" ADD CONSTRAINT "EmailSignature_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailSignature" ADD CONSTRAINT "EmailSignature_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
