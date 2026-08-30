CREATE TABLE "StockTransfer" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "fromWarehouseId" TEXT NOT NULL,
  "toWarehouseId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitCostCents" INTEGER,
  "reference" TEXT,
  "notes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'COMPLETED',
  "happenedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockTransfer_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StockTransfer_positive_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "StockTransfer_distinct_warehouses_check" CHECK ("fromWarehouseId" <> "toWarehouseId")
);

ALTER TABLE "StockMovement" ADD COLUMN "stockTransferId" TEXT;
ALTER TABLE "StockMovement" ADD COLUMN "transferLeg" TEXT;

CREATE INDEX "StockTransfer_companyId_happenedAt_idx" ON "StockTransfer"("companyId", "happenedAt");
CREATE INDEX "StockTransfer_fromWarehouseId_happenedAt_idx" ON "StockTransfer"("fromWarehouseId", "happenedAt");
CREATE INDEX "StockTransfer_toWarehouseId_happenedAt_idx" ON "StockTransfer"("toWarehouseId", "happenedAt");
CREATE INDEX "StockTransfer_productId_happenedAt_idx" ON "StockTransfer"("productId", "happenedAt");
CREATE INDEX "StockMovement_stockTransferId_transferLeg_idx" ON "StockMovement"("stockTransferId", "transferLeg");

ALTER TABLE "StockTransfer"
  ADD CONSTRAINT "StockTransfer_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StockTransfer"
  ADD CONSTRAINT "StockTransfer_fromWarehouseId_fkey"
  FOREIGN KEY ("fromWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StockTransfer"
  ADD CONSTRAINT "StockTransfer_toWarehouseId_fkey"
  FOREIGN KEY ("toWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StockTransfer"
  ADD CONSTRAINT "StockTransfer_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StockMovement"
  ADD CONSTRAINT "StockMovement_stockTransferId_fkey"
  FOREIGN KEY ("stockTransferId") REFERENCES "StockTransfer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
