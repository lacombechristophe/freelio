// Called after the E2E seed has checked its isolated database.
export async function seedOrderBillingAccounting(prisma, passwordHash) {
  for (const surface of ["desktop", "mobile"]) {
    for (const mode of ["DEPOSIT", "BALANCE"]) {
      const company = await prisma.company.create({ data: { name: `Fictional Accounting ${mode} ${surface}` } })
      const companyId = company.id
      const agency = await prisma.agency.create({ data: { companyId, code: "LOCAL", name: "Accounting agency" } })
      const user = await prisma.user.create({ data: { companyId, email: `accounting-order-${mode.toLowerCase()}-${surface}@example.test`, emailVerified: new Date(), passwordHash } })
      const membership = await prisma.membership.create({ data: { companyId, userId: user.id, role: "ACCOUNTING" } })
      await prisma.agencyMembership.create({ data: { membershipId: membership.id, agencyId: agency.id } })
      await prisma.saasSubscription.create({ data: { companyId, plan: "RESEAU", status: "ACTIVE", seatQuantity: 10 } })
      const client = await prisma.client.create({ data: { companyId, name: "Accounting order client" } })
      const project = await prisma.project.create({ data: { companyId, clientId: client.id, agencyId: agency.id, name: "Accounting project" } })
      await prisma.customerOrder.create({ data: { companyId, clientId: client.id, projectId: project.id, number: "ACCOUNTING-ORDER", totalHtCents: 10000, totalTvaCents: 2000, totalTtcCents: 12000, depositCents: 3000 } })
    }
  }
}
