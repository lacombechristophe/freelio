-- AlterTable
ALTER TABLE "ClientPortalAppointmentRequest" ADD COLUMN     "assignedMembershipId" TEXT,
ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "scheduledEnd" TIMESTAMP(3),
ADD COLUMN     "scheduledStart" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "PortalAppointment_member_status_start_idx" ON "ClientPortalAppointmentRequest"("companyId", "assignedMembershipId", "status", "scheduledStart");

-- AddForeignKey
ALTER TABLE "ClientPortalAppointmentRequest" ADD CONSTRAINT "ClientPortalAppointmentRequest_assignedMembershipId_fkey" FOREIGN KEY ("assignedMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
