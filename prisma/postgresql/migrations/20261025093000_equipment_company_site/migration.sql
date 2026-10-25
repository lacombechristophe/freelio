-- Support equipment reads scoped by company and customer site.
CREATE INDEX "Equipment_companyId_siteId_idx" ON "Equipment"("companyId", "siteId");
