-- Historical thread assignments and provider commands retain an unknown identity.
ALTER TABLE "EmailDelivery" ADD COLUMN "providerConversationId" TEXT;
ALTER TABLE "EmailThread" ADD COLUMN "providerConversationId" TEXT;
CREATE UNIQUE INDEX "EmailThread_native_conversation_key"
ON "EmailThread"("companyId", "channelId", "providerConversationId");
