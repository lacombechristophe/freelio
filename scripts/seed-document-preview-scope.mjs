// Called only by the guarded, disposable browser recipe.
export async function seedDocumentPreviewScope(prisma, passwordHash) {
  for (const surface of ["desktop", "mobile"]) {
    const company = await prisma.company.create({ data: { name: `Fictional PDF scope ${surface}`, isTvaApplicable: false } })
    const foreign = await prisma.company.create({ data: { name: `Fictional foreign PDF scope ${surface}` } })
    const user = await prisma.user.create({ data: { companyId: company.id, email: `pdf-scope-${surface}@example.test`, emailVerified: new Date(), passwordHash } })
    const membership = await prisma.membership.create({ data: { companyId: company.id, userId: user.id, role: "ACCOUNTING", status: "ACTIVE" } })
    await prisma.saasSubscription.create({ data: { companyId: company.id, plan: "RESEAU", status: "ACTIVE", seatQuantity: 10 } })
    const agency = await prisma.agency.create({ data: { companyId: company.id, code: "OWN", name: "Fictional PDF agency" } })
    await prisma.agencyMembership.create({ data: { membershipId: membership.id, agencyId: agency.id } })
    const ownClient = await prisma.client.create({ data: { companyId: company.id, name: "FICTIONAL-OWN-PREVIEW-PARTY" } })
    const foreignClient = await prisma.client.create({ data: { companyId: foreign.id, name: "FICTIONAL-FOREIGN-PREVIEW-PARTY", address: "FICTIONAL-PRIVATE-PREVIEW-ADDRESS" } })
    const project = await prisma.project.create({ data: { companyId: company.id, clientId: ownClient.id, agencyId: agency.id, name: "Fictional PDF scope project" } })
    for (const [kind, clientId] of [["own", ownClient.id], ["foreign", foreignClient.id]]) {
      const line = { label: "Fictional scope line", quantity: 1, unitPriceCents: 10000, tvaRate: 0 }
      const totals = { totalHtCents: 10000, totalTvaCents: 0, totalTtcCents: 10000 }
      await prisma.invoice.create({ data: { id: `cpdfinvoice${kind}${surface}`, companyId: company.id, clientId, projectId: project.id, number: `FICTIONAL-${kind}`, object: "Fictional scope invoice", dueDate: new Date("2030-02-01"), ...totals, lines: { create: line } } })
      await prisma.quote.create({ data: { id: `cpdfquote${kind}${surface}`, companyId: company.id, clientId, projectId: project.id, number: `FICTIONAL-${kind}`, object: "Fictional scope quote", versions: { create: { version: 1, ...totals, sections: { create: { title: "Fictional scope section", lines: { create: line } } } } } } })
    }
  }
}
