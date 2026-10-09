// Called only after seed-ui-redesign has checked its isolated database.
export async function seedOperationsOrderFinance(prisma, passwordHash) {
  for (const surface of ["desktop", "mobile"]) {
    const company = await prisma.company.create({ data: { name: `Fictional Operations billing ${surface}` } })
    const companyId = company.id
    const agency = await prisma.agency.create({ data: { companyId, code: "LOCAL", name: "Fictional billing agency" } })
    for (const role of ["OWNER", "TECHNICIAN", "VIEWER"]) {
      const user = await prisma.user.create({ data: { companyId, email: `operations-billing-${role.toLowerCase()}-${surface}@example.test`, emailVerified: new Date(), passwordHash } })
      const membership = await prisma.membership.create({ data: { companyId, userId: user.id, role } })
      await prisma.agencyMembership.create({ data: { membershipId: membership.id, agencyId: agency.id } })
    }
    await prisma.saasSubscription.create({ data: { companyId, plan: "RESEAU", status: "ACTIVE", seatQuantity: 10 } })
    const client = await prisma.client.create({ data: { companyId, name: "Fictional Operations billing client" } })
    const project = await prisma.project.create({ data: { companyId, clientId: client.id, agencyId: agency.id, name: "Fictional billing project" } })
    const scope = { companyId, clientId: client.id, projectId: project.id }
    const amounts = { totalHtCents: 10000, totalTvaCents: 2000, totalTtcCents: 12000 }
    await prisma.customerOrder.create({ data: { ...scope, ...amounts, number: "BILLING-OPEN", depositCents: 2000 } })
    const invoiced = await prisma.customerOrder.create({ data: { ...scope, ...amounts, number: "BILLING-INVOICED", billingStatus: "INVOICED" } })
    await prisma.invoice.create({ data: { ...scope, ...amounts, customerOrderId: invoiced.id, number: "BILLING-INVOICE", object: "Fictional billing invoice", dueDate: new Date("2030-01-01"), status: "ISSUED" } })
  }
}
