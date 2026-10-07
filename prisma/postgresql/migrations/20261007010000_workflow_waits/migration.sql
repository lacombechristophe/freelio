-- AlterTable
ALTER TABLE "AutomationRun" ADD COLUMN     "failures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "wakeAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "AutomationRunAction" ADD COLUMN     "errorCode" TEXT,
ADD COLUMN     "scheduledAt" TIMESTAMP(3),
ADD COLUMN     "startedAt" TIMESTAMP(3),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'COMPLETED',
ALTER COLUMN "completedAt" DROP NOT NULL;
