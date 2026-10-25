export async function seedProjectTemplateCount(prisma, passwordHash) {
  for (const surface of ["desktop", "mobile"]) {
    const company = await prisma.company.create({ data: { name: `Fictional model count ${surface}` } })
    const foreign = await prisma.company.create({ data: { name: `Fictional foreign model count ${surface}` } })
    await prisma.saasSubscription.create({ data: { companyId: company.id, plan: "RESEAU", status: "ACTIVE", seatQuantity: 10 } })
    const own = await prisma.agency.create({ data: { companyId: company.id, code: "OWN", name: "Fictional assigned model agency", isDefault: true } })
    const other = await prisma.agency.create({ data: { companyId: company.id, code: "OTHER", name: "Fictional unassigned model agency" } })
    const foreignAgency = await prisma.agency.create({ data: { companyId: foreign.id, code: "FOREIGN", name: "Fictional foreign model agency" } })
    for (const role of ["OWNER", "OPERATIONS"]) {
      const user = await prisma.user.create({ data: { companyId: company.id, email: `template-count-${role.toLowerCase()}-${surface}@example.test`, emailVerified: new Date(), passwordHash } })
      const membership = await prisma.membership.create({ data: { companyId: company.id, userId: user.id, role, status: "ACTIVE" } })
      await prisma.agencyMembership.create({ data: { membershipId: membership.id, agencyId: own.id } })
    }
    const client = await prisma.client.create({ data: { companyId: company.id, name: "Fictional counted project client" } })
    const foreignClient = await prisma.client.create({ data: { companyId: foreign.id, name: "Fictional foreign counted project client" } })
    const template = await prisma.projectTemplate.create({ data: { id: `cprojecttemplatecount${surface}`, companyId: company.id, name: "SCOPED-TEMPLATE-COUNT", defaultDurationDays: 30, steps: { create: { title: "Fictional preserved model step" } } } })
    const base = { companyId: company.id, clientId: client.id, projectTemplateId: template.id, name: "Fictional model project" }
    await prisma.project.createMany({ data: [
      { ...base, agencyId: own.id }, { ...base, agencyId: other.id }, { ...base, agencyId: null },
      { ...base, companyId: foreign.id, clientId: foreignClient.id },
      { ...base, clientId: foreignClient.id, agencyId: own.id }, { ...base, agencyId: foreignAgency.id },
    ] })
  }
}
