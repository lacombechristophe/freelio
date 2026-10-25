export async function seedPurchaseChoices(prisma, passwordHash) {
  for (const surface of ["desktop", "mobile"]) {
    const company = await prisma.company.create({ data: { name: `Fictional complete purchase choices ${surface}` } })
    const foreign = await prisma.company.create({ data: { name: `Foreign fictional purchase choices ${surface}` } })
    await prisma.saasSubscription.create({ data: { companyId: company.id, plan: "RESEAU", status: "ACTIVE", seatQuantity: 10 } })
    const user = await prisma.user.create({ data: { companyId: company.id, email: `purchase-choices-${surface}@example.test`, emailVerified: new Date(), passwordHash } })
    await prisma.membership.create({ data: { companyId: company.id, userId: user.id, role: "OWNER", status: "ACTIVE" } })
    const client = await prisma.client.create({ data: { companyId: company.id, name: "Fictional purchase choice client" } })
    const foreignClient = await prisma.client.create({ data: { companyId: foreign.id, name: "FOREIGN-PURCHASE-CLIENT" } })
    await prisma.supplier.create({ data: { id: `cpurchasechoicesupplier${surface}`, companyId: company.id, name: "Fictional purchase choice supplier" } })
    await prisma.product.createMany({ data: Array.from({ length: 500 }, (_, index) => ({
      ...(index === 0 ? { id: `cpurchasechoicefirstproduct${surface}` } : {}), companyId: company.id, sku: `SKU-${String(index).padStart(3, "0")}`, label: `Produit ${String(index).padStart(3, "0")}`,
    })) })
    await prisma.product.create({ data: { id: `cpurchasechoicelastproduct${surface}`, companyId: company.id, sku: "ZZ-LAST", label: "ZZ DERNIER PRODUIT", purchasePriceCents: 789 } })
    await prisma.product.create({ data: { companyId: foreign.id, sku: "FOREIGN", label: "FOREIGN-PURCHASE-PRODUCT" } })
    await prisma.project.createMany({ data: Array.from({ length: 300 }, (_, index) => ({
      ...(index === 0 ? { id: `cpurchasechoicefirstproject${surface}` } : {}), companyId: company.id, clientId: client.id, name: `Chantier ${String(index).padStart(3, "0")}`,
    })) })
    await prisma.project.create({ data: { id: `cpurchasechoicelastproject${surface}`, companyId: company.id, clientId: client.id, name: "ZZ DERNIER CHANTIER" } })
    await prisma.project.create({ data: { companyId: foreign.id, clientId: foreignClient.id, name: "FOREIGN-PURCHASE-PROJECT" } })
  }
}
