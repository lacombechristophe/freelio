ALTER TABLE "Company"
ADD COLUMN "serviceTimezone" TEXT NOT NULL DEFAULT 'Europe/Paris',
ADD COLUMN "serviceDayStart" INTEGER NOT NULL DEFAULT 8,
ADD COLUMN "serviceDayEnd" INTEGER NOT NULL DEFAULT 18,
ADD COLUMN "serviceWorkdays" JSONB,
ADD COLUMN "serviceHolidays" JSONB,
ADD COLUMN "serviceFirstResponseHours" JSONB,
ADD COLUMN "serviceResolutionHours" JSONB;

ALTER TABLE "ServiceTicket"
ADD COLUMN "firstRespondedAt" TIMESTAMP(3),
ADD COLUMN "waitingSince" TIMESTAMP(3),
ADD COLUMN "pausedMinutes" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Company" ADD CONSTRAINT "Company_service_hours_check" CHECK (
  "serviceDayStart" >= 0 AND "serviceDayStart" <= 22 AND
  "serviceDayEnd" >= 1 AND "serviceDayEnd" <= 23 AND
  "serviceDayStart" < "serviceDayEnd"
);
ALTER TABLE "ServiceTicket" ADD CONSTRAINT "ServiceTicket_paused_minutes_check" CHECK ("pausedMinutes" >= 0);
