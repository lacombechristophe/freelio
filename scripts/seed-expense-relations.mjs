// Called only after seed-ui-redesign has checked its isolated database.
export async function seedExpenseRelations(prisma, passwordHash) {
  for (const surface of ["desktop", "mobile"]) {
    const company = await prisma.company.create({ data: { name: `Fictional expense relations ${surface}` } })
    const foreignCompany = await prisma.company.create({ data: { name: `Fictional foreign expense company ${surface}` } })
    const companyId = company.id
    const agency = await prisma.agency.create({ data: { companyId, code: "LOCAL", name: "Fictional expense agency" } })
    for (const role of ["OWNER", "ACCOUNTING", "VIEWER"]) {
      const user = await prisma.user.create({ data: { companyId, email: `expense-relations-${role.toLowerCase()}-${surface}@example.test`, emailVerified: new Date(), passwordHash } })
      const membership = await prisma.membership.create({ data: { companyId, userId: user.id, role, status: "ACTIVE" } })
      await prisma.agencyMembership.create({ data: { membershipId: membership.id, agencyId: agency.id } })
    }
    await prisma.saasSubscription.create({ data: { companyId, plan: "RESEAU", status: "ACTIVE", seatQuantity: 10 } })
    const client = await prisma.client.create({ data: { companyId, name: "Fictional expense client" } })
    const foreignClient = await prisma.client.create({ data: { companyId: foreignCompany.id, name: "Fictional foreign expense client" } })
    const project = await prisma.project.create({ data: { companyId, clientId: client.id, agencyId: agency.id, name: "Fictional expense project" } })
    const invalidProject = await prisma.project.create({ data: { companyId, clientId: foreignClient.id, agencyId: agency.id, name: "Fictional inconsistent expense project" } })
    const foreignProject = await prisma.project.create({ data: { companyId: foreignCompany.id, clientId: foreignClient.id, name: "Fictional foreign expense project" } })
    for (const [label, clientId, projectId] of [
      ["EXPENSE-ALLOWED", client.id, project.id],
      ["EXPENSE-FOREIGN-CLIENT", foreignClient.id, project.id],
      ["EXPENSE-FOREIGN-PROJECT", client.id, foreignProject.id],
      ["EXPENSE-PROJECT-FOREIGN-CLIENT", null, invalidProject.id],
    ]) {
      await prisma.expense.create({ data: { companyId, clientId, projectId, label, amountCents: 1200, category: "TEST", date: new Date("2000-01-01") } })
    }
  }
}
