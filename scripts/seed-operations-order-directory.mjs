// Called after seed-ui-redesign has checked its isolated database.
export async function seedOperationsOrderDirectory(prisma, passwordHash) {
  for (const surface of ["desktop", "mobile"]) {
    for (const role of ["OWNER", "VIEWER"]) {
      const company = await prisma.company.create({ data: { name: `Fictional Operations directory ${role} ${surface}` } })
      const companyId = company.id
      const agency = await prisma.agency.create({ data: { companyId, code: "LOCAL", name: "Directory agency" } })
      const user = await prisma.user.create({ data: { companyId, email: `operations-directory-${role.toLowerCase()}-${surface}@example.test`, emailVerified: new Date(), passwordHash } })
      const membership = await prisma.membership.create({ data: { companyId, userId: user.id, role } })
      await prisma.agencyMembership.create({ data: { membershipId: membership.id, agencyId: agency.id } })
      await prisma.saasSubscription.create({ data: { companyId, plan: "RESEAU", status: "ACTIVE", seatQuantity: 10 } })
      const client = await prisma.client.create({ data: { companyId, name: "Directory client" } })
      const project = await prisma.project.create({ data: { companyId, clientId: client.id, agencyId: agency.id, name: "Directory project" } })
      const product = await prisma.product.create({ data: { companyId, sku: "DIRECTORY", label: "Directory product" } })
      const warehouse = await prisma.warehouse.create({ data: { companyId, agencyId: agency.id, code: "LOCAL", name: "Directory warehouse" } })
      await prisma.inventoryItem.create({ data: { companyId, productId: product.id, warehouseId: warehouse.id, quantity: 151, reservedQuantity: 151 } })
      await prisma.customerOrder.createMany({ data: Array.from({ length: 151 }, (_, index) => ({ companyId, clientId: client.id, projectId: project.id, number: `DIRECTORY-${String(index).padStart(3, "0")}`, totalTtcCents: 1200, createdAt: new Date(Date.UTC(2020, 0, 1, 0, index)) })) })
      const orders = await prisma.customerOrder.findMany({ where: { companyId }, select: { id: true, createdAt: true } })
      await prisma.stockReservation.createMany({ data: orders.map(order => ({ companyId, productId: product.id, warehouseId: warehouse.id, projectId: project.id, customerOrderId: order.id, quantity: 1, createdAt: order.createdAt })) })
    }
  }
}
