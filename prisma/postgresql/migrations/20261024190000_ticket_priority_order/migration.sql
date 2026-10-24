-- Keep the bounded priority preview in index order instead of sorting the full ticket graph.
CREATE INDEX "ServiceTicket_companyId_priority_updatedAt_id_idx" ON "ServiceTicket"("companyId", "priority", "updatedAt" DESC, "id");
