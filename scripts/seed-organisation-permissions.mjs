// Called only after seed-ui-redesign has checked its isolated database.
export async function seedOrganisationPermissions(prisma, passwordHash) {
  for (const surface of ["desktop", "mobile"]) {
    const company = await prisma.company.create({ data: { name: `Fictional Organisation permissions ${surface}` } })
    const companyId = company.id
    const agency = await prisma.agency.create({ data: { companyId, code: "LOCAL", name: "Fictional Organisation agency" } })
    for (const role of ["SERVICE", "SALES", "ACCOUNTING"]) {
      const user = await prisma.user.create({ data: { companyId, email: `organisation-${role.toLowerCase()}-${surface}@example.test`, emailVerified: new Date(), passwordHash } })
      const membership = await prisma.membership.create({ data: { companyId, userId: user.id, role, status: "ACTIVE" } })
      await prisma.agencyMembership.create({ data: { membershipId: membership.id, agencyId: agency.id } })
    }
    await prisma.saasSubscription.create({ data: { companyId, plan: "RESEAU", status: "ACTIVE", seatQuantity: 10 } })
    const client = await prisma.client.create({ data: { companyId, name: "Fictional Organisation client" } })
    const project = await prisma.project.create({ data: { companyId, clientId: client.id, agencyId: agency.id, name: "Retained operational project", budgetCents: 12300, consumedCents: 4500 } })
    const scope = { companyId, clientId: client.id, projectId: project.id }
    const amounts = { totalHtCents: 34000, totalTvaCents: 0, totalTtcCents: 34000 }
    await prisma.invoice.create({ data: { ...scope, ...amounts, number: "ORG-PRIVATE-FINANCE", object: "Fictional overdue invoice", dueDate: new Date("2000-01-01"), status: "OVERDUE" } })
    await prisma.quote.create({ data: { ...scope, number: "ORG-PRIVATE-SALES", object: "Fictional open quote", versions: { create: { version: 1, ...amounts } } } })
    const goal = await prisma.organisationGoal.create({ data: { companyId, title: "Retained operational goal" } })
    await prisma.organisationTask.create({ data: { ...scope, goalId: goal.id, title: "Retained blocked task", status: "BLOCKED" } })
  }
}
