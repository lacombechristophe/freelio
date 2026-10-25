export async function seedOperationsStockDirectory(prisma, passwordHash) {
  for (const surface of ["desktop", "mobile"]) {
    const company = await prisma.company.create({ data: { name: `Fictional Operations complete stock ${surface}` } })
    await prisma.saasSubscription.create({ data: { companyId: company.id, plan: "RESEAU", status: "ACTIVE", seatQuantity: 10 } })
    const user = await prisma.user.create({ data: { companyId: company.id, email: `operations-stock-${surface}@example.test`, emailVerified: new Date(), passwordHash } })
    await prisma.membership.create({ data: { companyId: company.id, userId: user.id, role: "OWNER", status: "ACTIVE" } })
    const agency = await prisma.agency.create({ data: { id: `copsstockagency${surface}`, companyId: company.id, code: "SOURCE", name: "Fictional stock agency", isDefault: true } })
    await prisma.agency.create({ data: { companyId: company.id, code: "OTHER", name: "Fictional other stock agency" } })
    const warehouse = await prisma.warehouse.create({ data: { companyId: company.id, agencyId: agency.id, code: "SOURCE", name: "Fictional stock warehouse" } })
    await prisma.product.createMany({ data: Array.from({ length: 500 }, (_, index) => ({ companyId: company.id, sku: `SKU-${String(index).padStart(3, "0")}`, label: `Produit ${String(index).padStart(3, "0")}` })) })
    const last = await prisma.product.create({ data: { id: `copsstocklast${surface}`, companyId: company.id, sku: "ZZ-LAST", label: "ZZ DERNIER PRODUIT", purchasePriceCents: 789 } })
    await prisma.inventoryItem.create({ data: { companyId: company.id, warehouseId: warehouse.id, productId: last.id, quantity: 12, reservedQuantity: 2, reorderPoint: 10 } })
  }
}
