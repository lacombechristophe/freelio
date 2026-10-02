ALTER TABLE "Company" ADD COLUMN "backupLeaseId" TEXT;
ALTER TABLE "Company" ADD COLUMN "backupStartedAt" TIMESTAMP(3);
ALTER TABLE "Company" ADD COLUMN "lastBackupAttemptAt" TIMESTAMP(3);
