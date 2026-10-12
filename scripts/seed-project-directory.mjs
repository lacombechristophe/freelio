// Used only by the guarded, disposable browser recipe.
export async function seedProjectDirectory(prisma, passwordHash) {
  for (const surface of ["desktop", "mobile"]) {
    const company = await prisma.company.create({ data: { name: `Fictional project directory ${surface}` } })
    const companyId = company.id
    const user = await prisma.user.create({ data: { companyId, email: `project-directory-${surface}@example.test`, emailVerified: new Date(), passwordHash } })
    await prisma.membership.create({ data: { companyId, userId: user.id, role: "OWNER", status: "ACTIVE" } })
    await prisma.saasSubscription.create({ data: { companyId, plan: "RESEAU", status: "ACTIVE", seatQuantity: 10 } })
    const agency = await prisma.agency.create({ data: { companyId, name: "Fictional local agency", code: "LOCAL", isDefault: true } })
    const client = await prisma.client.create({ data: { companyId, name: "Fictional project directory customer" } })
    const common = { companyId, clientId: client.id, agencyId: agency.id, worksiteType: "Installation", budgetCents: 120000, consumedCents: 30000, startDate: new Date("2001-01-01"), endDate: new Date("2001-01-03") }
    await prisma.project.create({ data: { ...common, id: `cprojectdirectoryolder${surface}`, name: "ZZ ANCIEN CHANTIER", description: "Fictional historical worksite", createdAt: new Date("2000-01-01"), status: "COMPLETED" } })
    await prisma.project.createMany({ data: Array.from({ length: 100 }, (_, i) => ({ ...common, name: `Recent project ${String(i).padStart(3, "0")}`, createdAt: new Date("2001-01-01") })) })
  }
}
