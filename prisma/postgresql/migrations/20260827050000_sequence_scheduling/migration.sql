ALTER TABLE "EmailSequence"
ADD COLUMN "businessDaysOnly" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "sendWindowStart" INTEGER NOT NULL DEFAULT 8,
ADD COLUMN "sendWindowEnd" INTEGER NOT NULL DEFAULT 18,
ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Europe/Paris';

ALTER TABLE "EmailSequence"
ADD CONSTRAINT "EmailSequence_send_window_check" CHECK (
  "sendWindowStart" >= 0 AND
  "sendWindowStart" <= 22 AND
  "sendWindowEnd" >= 1 AND
  "sendWindowEnd" <= 23 AND
  "sendWindowStart" < "sendWindowEnd"
);
