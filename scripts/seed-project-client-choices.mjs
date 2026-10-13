// Called only by the guarded, disposable browser recipe.
export async function seedProjectClientChoices(prisma, passwordHash) {
  for (const surface of ["desktop", "mobile"]) {
    const company = await prisma.company.create({ data: { name: `Fictional project client choices ${surface}` } })
    const user = await prisma.user.create({ data: { companyId: company.id, email: `project-client-choice-${surface}@example.test`, emailVerified: new Date(), passwordHash } })
    const membership = await prisma.membership.create({ data: { companyId: company.id, userId: user.id, role: "OPERATIONS", status: "ACTIVE" } })
    await prisma.saasSubscription.create({ data: { companyId: company.id, plan: "RESEAU", status: "ACTIVE", seatQuantity: 10 } })
    const agency = await prisma.agency.create({ data: { companyId: company.id, code: "OWN", name: "Fictional project choice agency", isDefault: true } })
    await prisma.agencyMembership.create({ data: { membershipId: membership.id, agencyId: agency.id } })
    await prisma.client.createMany({ data: Array.from({ length: 1000 }, (_, index) => ({ companyId: company.id, name: `Client ${String(index).padStart(4, "0")}` })) })
    const client = await prisma.client.create({ data: { id: `cprojectchoicelast${surface}`, companyId: company.id, name: "ZZ DERNIER CLIENT" } })
    await prisma.project.create({ data: { id: `cprojectchoiceexisting${surface}`, companyId: company.id, clientId: client.id, agencyId: agency.id, name: "EXISTING-LAST-CLIENT-PROJECT", budgetCents: 12345, description: "Fictional existing project choice" } })
  }
}
