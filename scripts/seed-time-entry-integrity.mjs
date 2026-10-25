// Used only by the guarded, isolated browser recipe.
export async function seedTimeEntryIntegrity(prisma, passwordHash) {
  for (const surface of ["desktop", "mobile"]) {
    const company = await prisma.company.create({ data: { name: `Fictional time integrity ${surface}` } })
    const foreignCompany = await prisma.company.create({ data: { name: `Fictional foreign time ${surface}` } })
    const companyId = company.id
    const user = await prisma.user.create({ data: { companyId, email: `time-integrity-${surface}@example.test`, emailVerified: new Date(), passwordHash } })
    await prisma.membership.create({ data: { companyId, userId: user.id, role: "OWNER", status: "ACTIVE" } })
    await prisma.saasSubscription.create({ data: { companyId, plan: "RESEAU", status: "ACTIVE", seatQuantity: 10 } })
    const client = await prisma.client.create({ data: { companyId, name: "Fictional time customer" } })
    const foreignClient = await prisma.client.create({ data: { companyId: foreignCompany.id, name: "Fictional foreign time customer" } })
    const projectId = `ctimeintegrityproject${surface}`
    await prisma.project.create({ data: { id: projectId, companyId, clientId: client.id, name: "FICTIONAL-TIME-PROJECT", consumedCents: 104 } })
    await prisma.project.create({ data: { id: `ctimeintegrityinvalid${surface}`, companyId, clientId: foreignClient.id, name: "FICTIONAL-INCOHERENT-PROJECT" } })
    const invoice = await prisma.invoice.create({ data: { companyId, clientId: client.id, projectId, number: `TIME-DRAFT-${surface}`, object: "Fictional allocated time", status: "DRAFT", totalHtCents: 104, totalTvaCents: 0, totalTtcCents: 104, dueDate: new Date("2030-01-01") } })
    await prisma.timeEntry.create({ data: { projectId, invoiceId: invoice.id, durationSec: 60, description: "FICTIONAL-BILLED-TIME" } })
  }
}
