-- CreateTable
CREATE TABLE "EmailSendQuotaPolicy" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "channelKey" TEXT NOT NULL,
    "channelId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "dailyRecipientLimit" INTEGER NOT NULL,
    "minuteRecipientLimit" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailSendQuotaPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailSendQuotaState" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "channelKey" TEXT NOT NULL,
    "channelId" TEXT,
    "period" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "EmailSendQuotaState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailSendQuotaCharge" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "channelKey" TEXT NOT NULL,
    "channelId" TEXT,
    "deliveryId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "recipientUnits" INTEGER NOT NULL,
    "bindingHash" TEXT NOT NULL,
    "policyVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailSendQuotaCharge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailSendQuotaPolicy_companyId_channelKey_key" ON "EmailSendQuotaPolicy"("companyId", "channelKey");

-- CreateIndex
CREATE UNIQUE INDEX "EmailSendQuotaState_companyId_channelKey_period_key" ON "EmailSendQuotaState"("companyId", "channelKey", "period");

-- CreateIndex
CREATE INDEX "EmailSendQuotaCharge_companyId_channelKey_period_windowStar_idx" ON "EmailSendQuotaCharge"("companyId", "channelKey", "period", "windowStart");

-- CreateIndex
CREATE UNIQUE INDEX "EmailSendQuotaCharge_deliveryId_period_windowStart_key" ON "EmailSendQuotaCharge"("deliveryId", "period", "windowStart");

-- AddForeignKey
ALTER TABLE "EmailSendQuotaPolicy" ADD CONSTRAINT "EmailSendQuotaPolicy_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailSendQuotaPolicy" ADD CONSTRAINT "EmailSendQuotaPolicy_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "CommunicationChannel"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailSendQuotaState" ADD CONSTRAINT "EmailSendQuotaState_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailSendQuotaState" ADD CONSTRAINT "EmailSendQuotaState_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "CommunicationChannel"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailSendQuotaCharge" ADD CONSTRAINT "EmailSendQuotaCharge_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailSendQuotaCharge" ADD CONSTRAINT "EmailSendQuotaCharge_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "CommunicationChannel"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailSendQuotaCharge" ADD CONSTRAINT "EmailSendQuotaCharge_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "EmailDelivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;
