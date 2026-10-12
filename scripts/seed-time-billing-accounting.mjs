// Called only by the guarded, disposable browser recipe.
export async function seedTimeBillingAccounting(prisma, passwordHash) {
  for (const surface of ["desktop", "mobile"]) {
    const company = await prisma.company.create({ data: { name: `Fictional time billing ${surface}`, isTvaApplicable: false } })
    const user = await prisma.user.create({ data: { companyId: company.id, email: `time-billing-${surface}@example.test`, emailVerified: new Date(), passwordHash } })
    const membership = await prisma.membership.create({ data: { companyId: company.id, userId: user.id, role: "ACCOUNTING", status: "ACTIVE" } })
    await prisma.saasSubscription.create({ data: { companyId: company.id, plan: "RESEAU", status: "ACTIVE", seatQuantity: 10 } })
    const agency = await prisma.agency.create({ data: { companyId: company.id, code: "OWN", name: "Fictional time billing agency" } })
    await prisma.agencyMembership.create({ data: { membershipId: membership.id, agencyId: agency.id } })
    const client = await prisma.client.create({ data: { companyId: company.id, name: "Fictional time billing customer" } })
    const project = await prisma.project.create({ data: { companyId: company.id, clientId: client.id, agencyId: agency.id, name: "FICTIONAL-ACCOUNTING-TIME-PROJECT" } })
    await prisma.timeEntry.create({ data: { id: `ctimebilling${surface}`, projectId: project.id, durationSec: 3600, description: "FICTIONAL-ACCOUNTING-TIME", date: new Date("2030-01-01") } })
  }
}
