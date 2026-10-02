ALTER TABLE "MigrationRun" ADD COLUMN "importStartedAt" TIMESTAMP(3);
ALTER TABLE "MigrationRun" ADD COLUMN "importHeartbeatAt" TIMESTAMP(3);
ALTER TABLE "MigrationRun" ADD COLUMN "importLeaseId" TEXT;
