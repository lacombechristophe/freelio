export async function seedPurchaseCreationIntegrity(prisma, passwordHash) {
  for (const surface of ["desktop", "mobile"]) {
    const company = await prisma.company.create({ data: { name: `Fictional purchase creation integrity ${surface}` } })
    const foreign = await prisma.company.create({ data: { name: `Foreign fictional purchase creation integrity ${surface}` } })
    await prisma.saasSubscription.create({ data: { companyId: company.id, plan: "RESEAU", status: "ACTIVE", seatQuantity: 10 } })
    const user = await prisma.user.create({ data: { companyId: company.id, email: `purchase-creation-${surface}@example.test`, emailVerified: new Date(), passwordHash } })
    await prisma.membership.create({ data: { companyId: company.id, userId: user.id, role: "OWNER", status: "ACTIVE" } })
    const client = await prisma.client.create({ data: { id: `cpurchaseintegrityclient${surface}`, companyId: company.id, name: "Fictional purchase creation client" } })
    await prisma.client.create({ data: { id: `cpurchaseintegrityforeignclient${surface}`, companyId: foreign.id, name: "Foreign fictional purchase creation client" } })
    await prisma.supplier.create({ data: { id: `cpurchaseintegritysupplier${surface}`, companyId: company.id, name: "Fictional purchase creation supplier" } })
    await prisma.product.create({ data: { id: `cpurchaseintegrityproduct${surface}`, companyId: company.id, sku: "FAKE-INTEGRITY", label: "Fictional purchase creation product", purchasePriceCents: 789 } })
    await prisma.project.create({ data: { id: `cpurchaseintegrityproject${surface}`, companyId: company.id, clientId: client.id, name: "Fictional purchase creation project" } })
  }
}
