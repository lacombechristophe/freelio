// The caller checks the isolated E2E database before invoking this fixture.
export async function seedRecurringInvoices(prisma, passwordHash) {
  for (const surface of ["desktop", "mobile"]) {
    const company = await prisma.company.create({ data: { name: `Fictional recurring readers ${surface}` } })
    const companyId = company.id
    const agency = await prisma.agency.create({ data: { companyId, code: "LOCAL", name: "Fictional recurring agency" } })
    const otherAgency = await prisma.agency.create({ data: { companyId, code: "OTHER", name: "Fictional other recurring agency" } })
    for (const role of ["OWNER", "SALES", "ACCOUNTING", "VIEWER"]) {
      const user = await prisma.user.create({ data: { companyId, email: `recurring-readers-${role.toLowerCase()}-${surface}@example.test`, emailVerified: new Date(), passwordHash } })
      const membership = await prisma.membership.create({ data: { companyId, userId: user.id, role } })
      await prisma.agencyMembership.create({ data: { membershipId: membership.id, agencyId: agency.id } })
    }
    await prisma.saasSubscription.create({ data: { companyId, plan: "RESEAU", status: "ACTIVE", seatQuantity: 10 } })
    const client = await prisma.client.create({ data: { companyId, name: "Fictional recurring client" } })
    const project = await prisma.project.create({ data: { companyId, clientId: client.id, agencyId: agency.id, name: "Fictional recurring project" } })
    const otherProject = await prisma.project.create({ data: { companyId, clientId: client.id, agencyId: otherAgency.id, name: "Fictional other recurring project" } })
    const template = projectId => ({ object: "Fictional recurring service", projectId, dueDays: 30, lines: [{ label: "Fictional service", quantity: 1, unitPriceCents: 10000, tvaRate: 0 }] })
    await prisma.recurringInvoice.createMany({ data: Array.from({ length: 530 }, (_, index) => ({
      id: `crecurring${surface}${String(index).padStart(10, "0")}`, companyId, clientId: client.id, projectId: project.id,
      label: `Fictional recurrence ${String(index).padStart(3, "0")}`, frequency: "MONTHLY", nextGenDate: new Date("2030-01-01"), template: template(project.id),
    })) })
    await prisma.recurringInvoice.create({ data: { companyId, clientId: client.id, projectId: otherProject.id, label: "Fictional other agency recurrence", frequency: "MONTHLY", nextGenDate: new Date("2030-01-01"), template: template(otherProject.id) } })
    await prisma.recurringInvoice.create({ data: { companyId, clientId: client.id, label: "Fictional unassigned recurrence", frequency: "MONTHLY", nextGenDate: new Date("2030-01-01"), template: template(null) } })
    await prisma.client.createMany({ data: Array.from({ length: 530 }, (_, index) => ({ companyId, name: `Fictional lookup client ${String(index).padStart(3, "0")}` })) })
    await prisma.project.createMany({ data: Array.from({ length: 530 }, (_, index) => ({ companyId, clientId: client.id, agencyId: agency.id, name: `Fictional lookup project ${String(index).padStart(3, "0")}` })) })
  }
}
