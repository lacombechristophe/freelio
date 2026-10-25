export async function seedOperationsProductChoices(prisma, passwordHash) {
  for (const surface of ["desktop", "mobile"]) {
    for (const kind of ["equipment", "movement", "transfer", "order", "reservation", "material"]) {
      const suffix = `${kind}${surface}`
      const company = await prisma.company.create({ data: { name: `Fictional Operations product choices ${kind} ${surface}` } })
      const other = await prisma.company.create({ data: { name: `Fictional foreign Operations product choices ${kind} ${surface}` } })
      await prisma.saasSubscription.create({ data: { companyId: company.id, plan: "RESEAU", status: "ACTIVE", seatQuantity: 10 } })
      const user = await prisma.user.create({ data: { companyId: company.id, email: `operations-product-choice-${kind}-${surface}@example.test`, emailVerified: new Date(), passwordHash } })
      await prisma.membership.create({ data: { companyId: company.id, userId: user.id, role: "OWNER", status: "ACTIVE" } })
      const client = await prisma.client.create({ data: { id: `copsproductclient${suffix}`, companyId: company.id, name: "Fictional product choice client" } })
      const site = await prisma.customerSite.create({ data: { id: `copsproductsite${suffix}`, companyId: company.id, clientId: client.id, label: "Fictional product choice site", address1: "12 rue fictive" } })
      const project = await prisma.project.create({ data: { id: `copsproductproject${suffix}`, companyId: company.id, clientId: client.id, name: "Fictional product choice project" } })
      await prisma.fieldIntervention.create({ data: { id: `copsproductintervention${suffix}`, companyId: company.id, siteId: site.id, projectId: project.id, title: "Fictional product choice intervention", scheduledStart: new Date("2030-01-02T12:00:00Z") } })
      const source = await prisma.warehouse.create({ data: { id: `copsproductsource${suffix}`, companyId: company.id, code: "SOURCE", name: "Fictional source warehouse" } })
      await prisma.warehouse.create({ data: { id: `copsproductdestination${suffix}`, companyId: company.id, code: "DESTINATION", name: "Fictional destination warehouse" } })
      await prisma.product.createMany({ data: Array.from({ length: 500 }, (_, index) => ({
        ...(index === 0 ? { id: `copsproductfirst${suffix}` } : {}), companyId: company.id, sku: `SKU-${String(index).padStart(3, "0")}`, label: `Produit ${String(index).padStart(3, "0")}`,
      })) })
      const last = await prisma.product.create({ data: { id: `copsproductlast${suffix}`, companyId: company.id, sku: "ZZ-LAST", label: "ZZ DERNIER PRODUIT", purchasePriceCents: 789, salePriceCents: 12345 } })
      await prisma.inventoryItem.create({ data: { companyId: company.id, warehouseId: source.id, productId: last.id, quantity: 100 } })
      await prisma.product.create({ data: { companyId: other.id, sku: "FOREIGN", label: "FOREIGN-PRODUCT-CHOICE" } })
    }
  }
}
