// Called only by the guarded, disposable browser recipe.
export async function seedTimeInvoiceSnapshot(prisma, passwordHash) {
  for (const kind of ["snapshot", "preview"]) for (const surface of ["desktop", "mobile"]) {
    const company = await prisma.company.create({ data: { name: `Fictional prepared invoice ${surface}`, isTvaApplicable: false } })
    const user = await prisma.user.create({ data: { companyId: company.id, email: `time-${kind}-${surface}@example.test`, emailVerified: new Date(), passwordHash } })
    const membership = await prisma.membership.create({ data: { companyId: company.id, userId: user.id, role: "ACCOUNTING", status: "ACTIVE" } })
    await prisma.saasSubscription.create({ data: { companyId: company.id, plan: "RESEAU", status: "ACTIVE", seatQuantity: 10 } })
    const agency = await prisma.agency.create({ data: { companyId: company.id, code: "OWN", name: "Fictional prepared invoice agency" } })
    await prisma.agencyMembership.create({ data: { membershipId: membership.id, agencyId: agency.id } })
    const client = await prisma.client.create({ data: { companyId: company.id, name: "Fictional prepared invoice customer" } })
    const project = await prisma.project.create({ data: { companyId: company.id, clientId: client.id, agencyId: agency.id, name: "FICTIONAL-SNAPSHOT-PROJECT" } })
    await prisma.timeEntry.create({ data: { id: `ctime${kind}${surface}`, projectId: project.id, durationSec: 3600, description: `FICTIONAL-${kind.toUpperCase()}-TIME`, date: new Date("2030-01-01") } })
    if (kind === "preview") {
      const other = await prisma.project.create({ data: { companyId: company.id, clientId: client.id, agencyId: agency.id, name: "FICTIONAL-PREVIEW-OTHER-PROJECT" } })
      await prisma.timeEntry.create({ data: { id: `ctimepreviewother${surface}`, projectId: other.id, durationSec: 3600, description: "FICTIONAL-PREVIEW-OTHER-TIME", date: new Date("2030-01-02") } })
    }
  }
}
