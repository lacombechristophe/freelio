// Called only after seed-ui-redesign has checked its isolated database.
export async function seedDocumentRelations(prisma, passwordHash) {
  for (const surface of ["desktop", "mobile"]) {
    const company = await prisma.company.create({ data: { name: `Fictional document readers ${surface}` } })
    const companyId = company.id
    const agency = await prisma.agency.create({ data: { companyId, code: "LOCAL", name: "Fictional document agency" } })
    for (const role of ["OWNER", "SALES", "ACCOUNTING"]) {
      const user = await prisma.user.create({ data: { companyId, email: `document-readers-${role.toLowerCase()}-${surface}@example.test`, emailVerified: new Date(), passwordHash } })
      const membership = await prisma.membership.create({ data: { companyId, userId: user.id, role } })
      await prisma.agencyMembership.create({ data: { membershipId: membership.id, agencyId: agency.id } })
    }
    await prisma.saasSubscription.create({ data: { companyId, plan: "RESEAU", status: "ACTIVE", seatQuantity: 10 } })
    const client = await prisma.client.create({ data: { companyId, name: "Fictional document reader client" } })
    const project = await prisma.project.create({ data: { companyId, clientId: client.id, agencyId: agency.id, name: "Fictional document reader project" } })
    const local = { companyId, clientId: client.id, projectId: project.id }
    const quote = await prisma.quote.create({ data: { id: `cdocument${surface}coherent`, ...local, number: "DOCUMENT-COHERENT", object: "Fictional coherent documents", status: "ACCEPTED" } })
    const masked = await prisma.quote.create({ data: { id: `cdocument${surface}masked`, ...local, number: "DOCUMENT-MASKED", object: "Fictional masked documents", status: "ACCEPTED" } })
    const order = await prisma.customerOrder.create({ data: { ...local, quoteId: quote.id, number: "DOCUMENT-ORDER", billingStatus: "INVOICED" } })
    await prisma.contract.create({ data: { companyId, clientId: client.id, sourceQuoteId: quote.id, number: "DOCUMENT-GENERATED", title: "Fictional generated document", content: "Fictional content" } })
    const foreign = await prisma.company.create({ data: { name: `Fictional foreign documents ${surface}` } })
    const foreignClient = await prisma.client.create({ data: { companyId: foreign.id, name: "Fictional foreign document client" } })
    const foreignProject = await prisma.project.create({ data: { companyId: foreign.id, clientId: foreignClient.id, name: "Fictional foreign document project" } })
    const foreignScope = { companyId: foreign.id, clientId: foreignClient.id, projectId: foreignProject.id }
    await prisma.customerOrder.create({ data: { ...foreignScope, quoteId: masked.id, number: "DOCUMENT-FOREIGN-ORDER" } })
    const parent = await prisma.contract.create({ data: { companyId: foreign.id, clientId: foreignClient.id, sourceQuoteId: masked.id, number: "DOCUMENT-FOREIGN-CONTRACT", title: "Fictional foreign source", content: "Fictional content" } })
    const fields = { object: "Fictional document invoice", dueDate: new Date("2030-01-01"), totalHtCents: 10000, totalTvaCents: 0, totalTtcCents: 10000 }
    const foreignInvoice = await prisma.invoice.create({ data: { ...foreignScope, customerOrderId: order.id, number: "DOCUMENT-FOREIGN-INVOICE", ...fields } })
    const invoice = await prisma.invoice.create({ data: { id: `cdocument${surface}invoice`, ...local, customerOrderId: order.id, originalInvoiceId: foreignInvoice.id, number: "DOCUMENT-INVOICE", ...fields } })
    await prisma.invoice.create({ data: { ...local, originalInvoiceId: invoice.id, number: "DOCUMENT-CREDIT", type: "CREDIT_NOTE", ...fields } })
    await prisma.invoice.create({ data: { ...foreignScope, originalInvoiceId: invoice.id, number: "DOCUMENT-FOREIGN-CREDIT", type: "CREDIT_NOTE", ...fields } })
    const site = await prisma.customerSite.create({ data: { companyId: foreign.id, clientId: foreignClient.id, label: "Fictional foreign document site", address1: "Fictional address" } })
    const maintenance = await prisma.maintenanceContract.create({ data: { companyId: foreign.id, clientId: foreignClient.id, siteId: site.id, number: "DOCUMENT-FOREIGN-MAINTENANCE", label: "Fictional foreign document maintenance", startDate: new Date("2030-01-01") } })
    const contract = await prisma.contract.create({ data: { id: `cdocument${surface}contract`, companyId, clientId: client.id, parentContractId: parent.id, maintenanceContractId: maintenance.id, number: "DOCUMENT-CONTRACT", title: "Fictional document contract", content: "<p>Fictional local agreement.</p>" } })
    await prisma.contract.create({ data: { companyId: foreign.id, clientId: foreignClient.id, parentContractId: contract.id, number: "DOCUMENT-FOREIGN-AMENDMENT", title: "Fictional foreign amendment", content: "Fictional content" } })
  }
}
