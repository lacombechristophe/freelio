-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "customerOrderId" TEXT;

-- AlterTable
ALTER TABLE "InvoiceLine" ADD COLUMN     "sourceKey" TEXT;

-- AlterTable
ALTER TABLE "ProjectTechnicalProfile" ADD COLUMN     "accessWidthMm" INTEGER,
ADD COLUMN     "copingType" TEXT,
ADD COLUMN     "coverColor" TEXT,
ADD COLUMN     "coverModel" TEXT,
ADD COLUMN     "deckMaterial" TEXT,
ADD COLUMN     "diagonal1Mm" INTEGER,
ADD COLUMN     "diagonal2Mm" INTEGER,
ADD COLUMN     "installationConstraints" TEXT,
ADD COLUMN     "measurementNotes" TEXT,
ADD COLUMN     "obstacles" TEXT,
ADD COLUMN     "poolDepthMm" INTEGER,
ADD COLUMN     "poolLengthMm" INTEGER,
ADD COLUMN     "poolShape" TEXT,
ADD COLUMN     "poolWidthMm" INTEGER,
ADD COLUMN     "powerSupply" TEXT,
ADD COLUMN     "recommendedProduct" TEXT,
ADD COLUMN     "surveyStatus" TEXT NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "surveyedAt" TIMESTAMP(3),
ADD COLUMN     "surveyedBy" TEXT,
ADD COLUMN     "validatedAt" TIMESTAMP(3),
ADD COLUMN     "validationNotes" TEXT;

-- AlterTable
ALTER TABLE "PurchaseOrderLine" ADD COLUMN     "sourceKey" TEXT;

-- AlterTable
ALTER TABLE "QuoteLine" ADD COLUMN     "sourceKey" TEXT;

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "reservationId" TEXT;

-- CreateTable
CREATE TABLE "LeadCapture" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clientId" TEXT,
    "contactId" TEXT,
    "opportunityId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "postalCode" TEXT,
    "city" TEXT,
    "projectType" TEXT,
    "message" TEXT,
    "source" TEXT NOT NULL DEFAULT 'WEBSITE',
    "landingPage" TEXT,
    "referrer" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "privacyAccepted" BOOLEAN NOT NULL,
    "marketingOptIn" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "fingerprint" TEXT NOT NULL,
    "ipHash" TEXT,
    "userAgentHash" TEXT,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadCapture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingConsent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clientId" TEXT,
    "contactId" TEXT,
    "leadCaptureId" TEXT,
    "channel" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "legalBasis" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "noticeUrl" TEXT,
    "noticeLabel" TEXT,
    "proofHash" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "MarketingConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerOrder" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "projectId" TEXT,
    "quoteId" TEXT,
    "number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "billingStatus" TEXT NOT NULL DEFAULT 'NOT_INVOICED',
    "orderDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "expectedInstallationAt" TIMESTAMP(3),
    "notes" TEXT,
    "totalHtCents" INTEGER NOT NULL DEFAULT 0,
    "totalTvaCents" INTEGER NOT NULL DEFAULT 0,
    "totalTtcCents" INTEGER NOT NULL DEFAULT 0,
    "depositCents" INTEGER NOT NULL DEFAULT 0,
    "customFields" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerOrderLine" (
    "id" TEXT NOT NULL,
    "customerOrderId" TEXT NOT NULL,
    "productId" TEXT,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "deliveredQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitPriceCents" INTEGER NOT NULL,
    "tvaRate" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "order" INTEGER NOT NULL DEFAULT 0,
    "sourceKey" TEXT,

    CONSTRAINT "CustomerOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryNote" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerOrderId" TEXT NOT NULL,
    "projectId" TEXT,
    "number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "deliveredAt" TIMESTAMP(3),
    "recipientName" TEXT,
    "signedAt" TIMESTAMP(3),
    "signatureSha256" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryNoteLine" (
    "id" TEXT NOT NULL,
    "deliveryNoteId" TEXT NOT NULL,
    "customerOrderLineId" TEXT,
    "productId" TEXT,
    "label" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "DeliveryNoteLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoodsReceipt" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supplierReference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoodsReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoodsReceiptLine" (
    "id" TEXT NOT NULL,
    "goodsReceiptId" TEXT NOT NULL,
    "purchaseOrderLineId" TEXT,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCostCents" INTEGER,

    CONSTRAINT "GoodsReceiptLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockReservation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "projectId" TEXT,
    "customerOrderId" TEXT,
    "quantity" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockReservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadCapture_companyId_createdAt_idx" ON "LeadCapture"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "LeadCapture_companyId_status_idx" ON "LeadCapture"("companyId", "status");

-- CreateIndex
CREATE INDEX "LeadCapture_companyId_fingerprint_createdAt_idx" ON "LeadCapture"("companyId", "fingerprint", "createdAt");

-- CreateIndex
CREATE INDEX "LeadCapture_clientId_idx" ON "LeadCapture"("clientId");

-- CreateIndex
CREATE INDEX "LeadCapture_contactId_idx" ON "LeadCapture"("contactId");

-- CreateIndex
CREATE INDEX "LeadCapture_opportunityId_idx" ON "LeadCapture"("opportunityId");

-- CreateIndex
CREATE INDEX "MarketingConsent_companyId_capturedAt_idx" ON "MarketingConsent"("companyId", "capturedAt");

-- CreateIndex
CREATE INDEX "MarketingConsent_companyId_channel_status_idx" ON "MarketingConsent"("companyId", "channel", "status");

-- CreateIndex
CREATE INDEX "MarketingConsent_clientId_idx" ON "MarketingConsent"("clientId");

-- CreateIndex
CREATE INDEX "MarketingConsent_contactId_idx" ON "MarketingConsent"("contactId");

-- CreateIndex
CREATE INDEX "MarketingConsent_leadCaptureId_idx" ON "MarketingConsent"("leadCaptureId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerOrder_quoteId_key" ON "CustomerOrder"("quoteId");

-- CreateIndex
CREATE INDEX "CustomerOrder_companyId_status_idx" ON "CustomerOrder"("companyId", "status");

-- CreateIndex
CREATE INDEX "CustomerOrder_clientId_idx" ON "CustomerOrder"("clientId");

-- CreateIndex
CREATE INDEX "CustomerOrder_projectId_idx" ON "CustomerOrder"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerOrder_companyId_number_key" ON "CustomerOrder"("companyId", "number");

-- CreateIndex
CREATE INDEX "CustomerOrderLine_customerOrderId_idx" ON "CustomerOrderLine"("customerOrderId");

-- CreateIndex
CREATE INDEX "CustomerOrderLine_productId_idx" ON "CustomerOrderLine"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerOrderLine_customerOrderId_sourceKey_key" ON "CustomerOrderLine"("customerOrderId", "sourceKey");

-- CreateIndex
CREATE INDEX "DeliveryNote_companyId_status_idx" ON "DeliveryNote"("companyId", "status");

-- CreateIndex
CREATE INDEX "DeliveryNote_customerOrderId_idx" ON "DeliveryNote"("customerOrderId");

-- CreateIndex
CREATE INDEX "DeliveryNote_projectId_idx" ON "DeliveryNote"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryNote_companyId_number_key" ON "DeliveryNote"("companyId", "number");

-- CreateIndex
CREATE INDEX "DeliveryNoteLine_deliveryNoteId_idx" ON "DeliveryNoteLine"("deliveryNoteId");

-- CreateIndex
CREATE INDEX "DeliveryNoteLine_customerOrderLineId_idx" ON "DeliveryNoteLine"("customerOrderLineId");

-- CreateIndex
CREATE INDEX "DeliveryNoteLine_productId_idx" ON "DeliveryNoteLine"("productId");

-- CreateIndex
CREATE INDEX "GoodsReceipt_companyId_receivedAt_idx" ON "GoodsReceipt"("companyId", "receivedAt");

-- CreateIndex
CREATE INDEX "GoodsReceipt_purchaseOrderId_idx" ON "GoodsReceipt"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "GoodsReceipt_warehouseId_idx" ON "GoodsReceipt"("warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "GoodsReceipt_companyId_number_key" ON "GoodsReceipt"("companyId", "number");

-- CreateIndex
CREATE INDEX "GoodsReceiptLine_goodsReceiptId_idx" ON "GoodsReceiptLine"("goodsReceiptId");

-- CreateIndex
CREATE INDEX "GoodsReceiptLine_purchaseOrderLineId_idx" ON "GoodsReceiptLine"("purchaseOrderLineId");

-- CreateIndex
CREATE INDEX "GoodsReceiptLine_productId_idx" ON "GoodsReceiptLine"("productId");

-- CreateIndex
CREATE INDEX "StockReservation_companyId_status_idx" ON "StockReservation"("companyId", "status");

-- CreateIndex
CREATE INDEX "StockReservation_warehouseId_productId_idx" ON "StockReservation"("warehouseId", "productId");

-- CreateIndex
CREATE INDEX "StockReservation_projectId_idx" ON "StockReservation"("projectId");

-- CreateIndex
CREATE INDEX "StockReservation_customerOrderId_idx" ON "StockReservation"("customerOrderId");

-- CreateIndex
CREATE INDEX "Invoice_customerOrderId_idx" ON "Invoice"("customerOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceLine_invoiceId_sourceKey_key" ON "InvoiceLine"("invoiceId", "sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrderLine_purchaseOrderId_sourceKey_key" ON "PurchaseOrderLine"("purchaseOrderId", "sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteLine_sectionId_sourceKey_key" ON "QuoteLine"("sectionId", "sourceKey");

-- CreateIndex
CREATE INDEX "StockMovement_reservationId_idx" ON "StockMovement"("reservationId");

-- AddForeignKey
ALTER TABLE "LeadCapture" ADD CONSTRAINT "LeadCapture_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadCapture" ADD CONSTRAINT "LeadCapture_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadCapture" ADD CONSTRAINT "LeadCapture_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadCapture" ADD CONSTRAINT "LeadCapture_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingConsent" ADD CONSTRAINT "MarketingConsent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingConsent" ADD CONSTRAINT "MarketingConsent_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingConsent" ADD CONSTRAINT "MarketingConsent_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingConsent" ADD CONSTRAINT "MarketingConsent_leadCaptureId_fkey" FOREIGN KEY ("leadCaptureId") REFERENCES "LeadCapture"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "StockReservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerOrder" ADD CONSTRAINT "CustomerOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerOrder" ADD CONSTRAINT "CustomerOrder_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerOrder" ADD CONSTRAINT "CustomerOrder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerOrder" ADD CONSTRAINT "CustomerOrder_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerOrderLine" ADD CONSTRAINT "CustomerOrderLine_customerOrderId_fkey" FOREIGN KEY ("customerOrderId") REFERENCES "CustomerOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerOrderLine" ADD CONSTRAINT "CustomerOrderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNote" ADD CONSTRAINT "DeliveryNote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNote" ADD CONSTRAINT "DeliveryNote_customerOrderId_fkey" FOREIGN KEY ("customerOrderId") REFERENCES "CustomerOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNote" ADD CONSTRAINT "DeliveryNote_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNoteLine" ADD CONSTRAINT "DeliveryNoteLine_deliveryNoteId_fkey" FOREIGN KEY ("deliveryNoteId") REFERENCES "DeliveryNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNoteLine" ADD CONSTRAINT "DeliveryNoteLine_customerOrderLineId_fkey" FOREIGN KEY ("customerOrderLineId") REFERENCES "CustomerOrderLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNoteLine" ADD CONSTRAINT "DeliveryNoteLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceiptLine" ADD CONSTRAINT "GoodsReceiptLine_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "GoodsReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceiptLine" ADD CONSTRAINT "GoodsReceiptLine_purchaseOrderLineId_fkey" FOREIGN KEY ("purchaseOrderLineId") REFERENCES "PurchaseOrderLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceiptLine" ADD CONSTRAINT "GoodsReceiptLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_customerOrderId_fkey" FOREIGN KEY ("customerOrderId") REFERENCES "CustomerOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_customerOrderId_fkey" FOREIGN KEY ("customerOrderId") REFERENCES "CustomerOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
