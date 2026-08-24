ALTER TABLE "GoodsReceiptLine"
ADD COLUMN "acceptedQuantity" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "rejectedQuantity" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "GoodsReceiptLine" DROP CONSTRAINT "GoodsReceiptLine_productId_fkey";
ALTER TABLE "GoodsReceiptLine" ALTER COLUMN "productId" DROP NOT NULL;
ALTER TABLE "GoodsReceiptLine" ADD CONSTRAINT "GoodsReceiptLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "GoodsReceiptLine"
SET "acceptedQuantity" = "quantity";

ALTER TABLE "PurchaseOrder"
ADD COLUMN "acknowledgedAt" TIMESTAMP(3),
ADD COLUMN "approvedAt" TIMESTAMP(3),
ADD COLUMN "approvedByMembershipId" TEXT,
ADD COLUMN "confirmedExpectedAt" TIMESTAMP(3),
ADD COLUMN "sentAt" TIMESTAMP(3),
ADD COLUMN "submittedAt" TIMESTAMP(3),
ADD COLUMN "supplierReference" TEXT;

ALTER TABLE "PurchaseOrderLine"
ADD COLUMN "creditedQuantity" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "PurchaseIssue" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "purchaseOrderLineId" TEXT NOT NULL,
    "goodsReceiptLineId" TEXT,
    "productId" TEXT,
    "type" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "resolution" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PurchaseIssue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupplierReturn" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "purchaseOrderLineId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "stockMovementId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCostCents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SHIPPED',
    "shippedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creditedAt" TIMESTAMP(3),
    "creditReference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SupplierReturn_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PurchaseIssue_companyId_status_createdAt_idx" ON "PurchaseIssue"("companyId", "status", "createdAt");
CREATE INDEX "PurchaseIssue_purchaseOrderId_idx" ON "PurchaseIssue"("purchaseOrderId");
CREATE INDEX "PurchaseIssue_purchaseOrderLineId_idx" ON "PurchaseIssue"("purchaseOrderLineId");
CREATE INDEX "PurchaseIssue_goodsReceiptLineId_idx" ON "PurchaseIssue"("goodsReceiptLineId");
CREATE UNIQUE INDEX "SupplierReturn_stockMovementId_key" ON "SupplierReturn"("stockMovementId");
CREATE INDEX "SupplierReturn_companyId_status_shippedAt_idx" ON "SupplierReturn"("companyId", "status", "shippedAt");
CREATE INDEX "SupplierReturn_purchaseOrderId_idx" ON "SupplierReturn"("purchaseOrderId");
CREATE INDEX "SupplierReturn_supplierId_idx" ON "SupplierReturn"("supplierId");
CREATE INDEX "SupplierReturn_warehouseId_productId_idx" ON "SupplierReturn"("warehouseId", "productId");
CREATE UNIQUE INDEX "SupplierReturn_companyId_number_key" ON "SupplierReturn"("companyId", "number");
CREATE INDEX "PurchaseOrder_approvedByMembershipId_idx" ON "PurchaseOrder"("approvedByMembershipId");
CREATE INDEX "PurchaseOrder_companyId_expectedAt_idx" ON "PurchaseOrder"("companyId", "expectedAt");

ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_approvedByMembershipId_fkey" FOREIGN KEY ("approvedByMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PurchaseIssue" ADD CONSTRAINT "PurchaseIssue_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PurchaseIssue" ADD CONSTRAINT "PurchaseIssue_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PurchaseIssue" ADD CONSTRAINT "PurchaseIssue_purchaseOrderLineId_fkey" FOREIGN KEY ("purchaseOrderLineId") REFERENCES "PurchaseOrderLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PurchaseIssue" ADD CONSTRAINT "PurchaseIssue_goodsReceiptLineId_fkey" FOREIGN KEY ("goodsReceiptLineId") REFERENCES "GoodsReceiptLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PurchaseIssue" ADD CONSTRAINT "PurchaseIssue_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupplierReturn" ADD CONSTRAINT "SupplierReturn_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierReturn" ADD CONSTRAINT "SupplierReturn_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierReturn" ADD CONSTRAINT "SupplierReturn_purchaseOrderLineId_fkey" FOREIGN KEY ("purchaseOrderLineId") REFERENCES "PurchaseOrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierReturn" ADD CONSTRAINT "SupplierReturn_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierReturn" ADD CONSTRAINT "SupplierReturn_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierReturn" ADD CONSTRAINT "SupplierReturn_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierReturn" ADD CONSTRAINT "SupplierReturn_stockMovementId_fkey" FOREIGN KEY ("stockMovementId") REFERENCES "StockMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
