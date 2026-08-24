ALTER TABLE "Product"
ADD COLUMN "parentProductId" TEXT,
ADD COLUMN "variantLabel" TEXT;

ALTER TABLE "QuoteLine"
ADD COLUMN "configuration" JSONB,
ADD COLUMN "discountRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "listUnitPriceCents" INTEGER,
ADD COLUMN "productId" TEXT,
ADD COLUMN "unitCostCents" INTEGER;

CREATE TABLE "ProductOptionGroup" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "minSelect" INTEGER NOT NULL DEFAULT 0,
    "maxSelect" INTEGER NOT NULL DEFAULT 1,
    "order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ProductOptionGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductOptionValue" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "code" TEXT,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "priceDeltaCents" INTEGER NOT NULL DEFAULT 0,
    "costDeltaCents" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    CONSTRAINT "ProductOptionValue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductComponent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "componentProductId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "wastePercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    CONSTRAINT "ProductComponent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductPrice" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "supplierId" TEXT,
    "kind" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductPrice_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProductOptionGroup_companyId_productId_order_idx" ON "ProductOptionGroup"("companyId", "productId", "order");
CREATE UNIQUE INDEX "ProductOptionGroup_productId_name_key" ON "ProductOptionGroup"("productId", "name");
CREATE INDEX "ProductOptionValue_companyId_groupId_active_order_idx" ON "ProductOptionValue"("companyId", "groupId", "active", "order");
CREATE UNIQUE INDEX "ProductOptionValue_groupId_label_key" ON "ProductOptionValue"("groupId", "label");
CREATE INDEX "ProductComponent_companyId_productId_idx" ON "ProductComponent"("companyId", "productId");
CREATE INDEX "ProductComponent_componentProductId_idx" ON "ProductComponent"("componentProductId");
CREATE UNIQUE INDEX "ProductComponent_productId_componentProductId_key" ON "ProductComponent"("productId", "componentProductId");
CREATE INDEX "ProductPrice_companyId_kind_validFrom_idx" ON "ProductPrice"("companyId", "kind", "validFrom");
CREATE INDEX "ProductPrice_supplierId_idx" ON "ProductPrice"("supplierId");
CREATE UNIQUE INDEX "ProductPrice_productId_kind_validFrom_key" ON "ProductPrice"("productId", "kind", "validFrom");
CREATE INDEX "Product_parentProductId_active_idx" ON "Product"("parentProductId", "active");
CREATE INDEX "QuoteLine_productId_idx" ON "QuoteLine"("productId");

ALTER TABLE "Product" ADD CONSTRAINT "Product_parentProductId_fkey" FOREIGN KEY ("parentProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductOptionGroup" ADD CONSTRAINT "ProductOptionGroup_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductOptionGroup" ADD CONSTRAINT "ProductOptionGroup_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductOptionValue" ADD CONSTRAINT "ProductOptionValue_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductOptionValue" ADD CONSTRAINT "ProductOptionValue_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ProductOptionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductComponent" ADD CONSTRAINT "ProductComponent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductComponent" ADD CONSTRAINT "ProductComponent_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductComponent" ADD CONSTRAINT "ProductComponent_componentProductId_fkey" FOREIGN KEY ("componentProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductPrice" ADD CONSTRAINT "ProductPrice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductPrice" ADD CONSTRAINT "ProductPrice_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductPrice" ADD CONSTRAINT "ProductPrice_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Preserve the current prices of existing references as the first historical period.
INSERT INTO "ProductPrice" ("id", "companyId", "productId", "supplierId", "kind", "amountCents", "validFrom")
SELECT CONCAT('price-purchase-', "id"), "companyId", "id", "supplierId", 'PURCHASE', "purchasePriceCents", "createdAt"
FROM "Product";

INSERT INTO "ProductPrice" ("id", "companyId", "productId", "kind", "amountCents", "validFrom")
SELECT CONCAT('price-sale-', "id"), "companyId", "id", 'SALE', "salePriceCents", "createdAt"
FROM "Product";
