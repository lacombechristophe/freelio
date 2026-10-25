// Called only by the guarded, disposable browser recipe.
export async function seedTimeInvoiceRelease(prisma, passwordHash) {
  for (const surface of ["desktop", "mobile"]) {
    const company = await prisma.company.create({ data: { name: `Fictional draft release ${surface}`, isTvaApplicable: false } })
    const user = await prisma.user.create({ data: { companyId: company.id, email: `time-release-${surface}@example.test`, emailVerified: new Date(), passwordHash } })
    const membership = await prisma.membership.create({ data: { companyId: company.id, userId: user.id, role: "ACCOUNTING", status: "ACTIVE" } })
    await prisma.saasSubscription.create({ data: { companyId: company.id, plan: "RESEAU", status: "ACTIVE", seatQuantity: 10 } })
    const agency = await prisma.agency.create({ data: { companyId: company.id, code: "OWN", name: "Fictional release agency" } })
    await prisma.agencyMembership.create({ data: { membershipId: membership.id, agencyId: agency.id } })
    const client = await prisma.client.create({ data: { companyId: company.id, name: "Fictional release customer" } })
    const project = await prisma.project.create({ data: { companyId: company.id, clientId: client.id, agencyId: agency.id, name: "FICTIONAL-RELEASE-PROJECT", consumedCents: 6250 } })
    const invoice = await prisma.invoice.create({ data: { id: `cinvoicerelease${surface}`, companyId: company.id, clientId: client.id, projectId: project.id, number: "FICTIONAL-RELEASE-DRAFT", object: "Fictional allocated time", dueDate: new Date("2030-02-01"), totalHtCents: 10000, totalTvaCents: 0, totalTtcCents: 10000, lines: { create: { label: "Fictional allocated time", quantity: 1, unitPriceCents: 10000, tvaRate: 0 } } } })
    await prisma.timeEntry.create({ data: { id: `ctimerelease${surface}`, projectId: project.id, invoiceId: invoice.id, durationSec: 3600, description: "FICTIONAL-RELEASE-TIME", date: new Date("2030-01-01") } })
  }
}
