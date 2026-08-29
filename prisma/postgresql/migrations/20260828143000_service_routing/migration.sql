ALTER TABLE "Membership"
ADD COLUMN "serviceAvailable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "serviceTicketCapacity" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN "serviceSkills" JSONB,
ADD COLUMN "serviceTerritories" JSONB;

ALTER TABLE "ServiceTicket"
ADD COLUMN "requiredSkill" TEXT,
ADD COLUMN "territory" TEXT,
ADD COLUMN "routingReason" TEXT,
ADD COLUMN "routedAt" TIMESTAMP(3);

ALTER TABLE "Membership" ADD CONSTRAINT "Membership_service_ticket_capacity_check"
CHECK ("serviceTicketCapacity" >= 1 AND "serviceTicketCapacity" <= 500);

CREATE INDEX "ServiceTicket_companyId_requiredSkill_territory_idx"
ON "ServiceTicket"("companyId", "requiredSkill", "territory");
