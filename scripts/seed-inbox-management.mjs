// Only called by the guarded UI seed on a new fictional database.
export async function seedInboxManagement(prisma, passwordHash) {
  for (const surface of ["desktop", "mobile"]) {
    const company = await prisma.company.create({ data: { name: `Fictional inbox management ${surface}` } })
    await prisma.saasSubscription.create({ data: { companyId: company.id, plan: "RESEAU", status: "ACTIVE", seatQuantity: 5 } })
    const user = await prisma.user.create({ data: { companyId: company.id, name: "Fictional inbox operator", email: `inbox-management-${surface}@example.test`, emailVerified: new Date(), passwordHash } })
    await prisma.membership.create({ data: { companyId: company.id, userId: user.id, role: "SALES", status: "ACTIVE" } })
    const channel = await prisma.communicationChannel.create({ data: { companyId: company.id, provider: "RESEND", emailAddress: "inbox-management@example.test", displayName: "Fictional inbox mailbox", visibility: "SHARED", status: "DISCONNECTED" } })
    await prisma.emailThread.create({ data: { companyId: company.id, channelId: channel.id, subject: "UIQA Inbox management",
      messages: { create: { companyId: company.id, provider: "RESEND", direction: "INBOUND", fromAddress: "sender@example.test", toAddresses: [channel.emailAddress], subject: "UIQA Inbox management", bodyText: "Fictional inbox management message", status: "RECEIVED" } },
    } })
  }
}
