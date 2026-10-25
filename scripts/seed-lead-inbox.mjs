export async function seedLeadInbox(prisma, passwordHash) {
  for (const surface of ["desktop", "mobile"]) {
    const company = await prisma.company.create({ data: { name: `Fictional incoming inbox ${surface}` } })
    const other = await prisma.company.create({ data: { name: `Fictional foreign incoming inbox ${surface}` } })
    await prisma.saasSubscription.create({ data: { companyId: company.id, plan: "RESEAU", status: "ACTIVE", seatQuantity: 10 } })
    const user = await prisma.user.create({ data: { companyId: company.id, email: `lead-inbox-${surface}@example.test`, emailVerified: new Date(), passwordHash } })
    await prisma.membership.create({ data: { companyId: company.id, userId: user.id, role: "OWNER", status: "ACTIVE" } })
    const client = await prisma.client.create({ data: { companyId: company.id, name: "Fictional incoming inbox client" } })
    await prisma.leadCapture.createMany({ data: Array.from({ length: 151 }, (_, index) => ({
      id: index === 0 ? `cleadinboxoldest${surface}` : `cleadinbox${surface}${index}`,
      companyId: company.id, clientId: client.id,
      firstName: index === 0 ? "OLDEST-INBOX-LEAD" : `Fictional ${index}`, lastName: "Portfolio",
      email: `inbox-${surface}-${index}@example.test`, city: "Paris", projectType: "Fictional installation",
      privacyAccepted: true, marketingOptIn: index === 0, source: "WEBSITE", fingerprint: `fictional-inbox-${surface}-${index}`,
      createdAt: new Date(Date.UTC(2025, 0, 1, 12, index)),
    })) })
    await prisma.leadCapture.create({ data: { companyId: other.id, firstName: "FOREIGN-INBOX-MARKER", lastName: "Portfolio", privacyAccepted: true, fingerprint: `fictional-foreign-inbox-${surface}` } })
  }
}
