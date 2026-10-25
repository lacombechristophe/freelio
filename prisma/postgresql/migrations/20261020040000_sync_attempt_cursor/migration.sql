-- Unknown historical attempts stay unknown; successful mail timestamps are unchanged.
ALTER TABLE "CommunicationChannel" ADD COLUMN "syncAttemptCursor" TIMESTAMP(3);
CREATE INDEX "CommunicationChannel_sync_attempt_idx"
ON "CommunicationChannel"("status", "syncAttemptCursor", "id");
