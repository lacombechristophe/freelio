ALTER TABLE "Quote"
  ADD COLUMN "sentAt" TIMESTAMP(3),
  ADD COLUMN "acceptedAt" TIMESTAMP(3),
  ADD COLUMN "rejectedAt" TIMESTAMP(3),
  ADD COLUMN "expiredAt" TIMESTAMP(3);

ALTER TABLE "Contract" ADD COLUMN "sourceQuoteId" TEXT;

CREATE UNIQUE INDEX "Contract_sourceQuoteId_key" ON "Contract"("sourceQuoteId");

UPDATE "Quote" SET "sentAt" = "updatedAt" WHERE "status" = 'SENT' AND "sentAt" IS NULL;
UPDATE "Quote" SET "acceptedAt" = "updatedAt" WHERE "status" = 'ACCEPTED' AND "acceptedAt" IS NULL;
UPDATE "Quote" SET "rejectedAt" = "updatedAt" WHERE "status" = 'REJECTED' AND "rejectedAt" IS NULL;
UPDATE "Quote" SET "expiredAt" = "updatedAt" WHERE "status" = 'EXPIRED' AND "expiredAt" IS NULL;

ALTER TABLE "Pipeline" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Contract"
  ADD CONSTRAINT "Contract_sourceQuoteId_fkey"
  FOREIGN KEY ("sourceQuoteId") REFERENCES "Quote"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
