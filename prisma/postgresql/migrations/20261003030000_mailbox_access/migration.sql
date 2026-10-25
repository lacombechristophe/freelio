ALTER TABLE "CommunicationChannel"
  ADD COLUMN "ownerUserId" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'PRIVATE',
  ADD COLUMN "mailEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "calendarEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "oauthNonceHash" TEXT,
  ADD COLUMN "oauthAttemptId" TEXT,
  ADD COLUMN "oauthExpiresAt" TIMESTAMP(3),
  ADD COLUMN "oauthStartedByUserId" TEXT;
-- Existing connections did not record their owner's consent to sharing.
-- Administrators must explicitly classify them before granting member access.
UPDATE "CommunicationChannel" SET "visibility" = 'LEGACY';
ALTER TABLE "EmailThread" ADD COLUMN "channelId" TEXT REFERENCES "CommunicationChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AutomationEventOutbox" ADD COLUMN "channelId" TEXT REFERENCES "CommunicationChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Only attach a legacy thread if every attributed message points at one box.
WITH associations AS (
  SELECT m."threadId", MIN(c."id") AS "channelId", COUNT(DISTINCT c."id") AS boxes,
    COUNT(c."id") AS attributed, COUNT(*) AS messages
  FROM "EmailMessage" m LEFT JOIN "CommunicationChannel" c ON c."companyId" = m."companyId" AND c."provider" = m."provider"
    AND (m."providerId" LIKE c."id" || ':%' OR (m."direction" = 'OUTBOUND' AND lower(btrim(regexp_replace(m."fromAddress", '^.*<([^>]+)>.*$', '\1'))) = lower(c."emailAddress")))
  GROUP BY m."threadId"
)
UPDATE "EmailThread" t SET "channelId" = a."channelId" FROM associations a WHERE a."threadId" = t."id" AND a.boxes = 1 AND a.attributed = a.messages;
-- Unmapped historical rows remain visible to administrators for reconciliation.
UPDATE "OrganisationTask" t SET "calendarChannelId" = NULL
WHERE t."calendarChannelId" IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM "CommunicationChannel" c WHERE c."id" = t."calendarChannelId" AND c."companyId" = t."companyId"
);
ALTER TABLE "OrganisationTask" ADD CONSTRAINT "OrganisationTask_calendarChannelId_fkey"
  FOREIGN KEY ("calendarChannelId") REFERENCES "CommunicationChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
