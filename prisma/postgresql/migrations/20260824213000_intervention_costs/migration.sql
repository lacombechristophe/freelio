ALTER TABLE "Membership"
ADD COLUMN "hourlyCostCents" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "StockMovement"
ADD COLUMN "fieldInterventionId" TEXT;

CREATE INDEX "StockMovement_fieldInterventionId_happenedAt_idx"
ON "StockMovement"("fieldInterventionId", "happenedAt");

ALTER TABLE "StockMovement"
ADD CONSTRAINT "StockMovement_fieldInterventionId_fkey"
FOREIGN KEY ("fieldInterventionId") REFERENCES "FieldIntervention"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
