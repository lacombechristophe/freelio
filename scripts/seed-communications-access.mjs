import { randomUUID } from "node:crypto"

// Called by the guarded UI seed, on a new fictional database only.
export async function seedCommunicationsAccess(prisma, passwordHash) {
  for (const surface of ["desktop", "mobile"]) {
    const company = await prisma.company.create({ data: { name: `Fictional Communications access ${surface}` } })
    const companyId = company.id
    await prisma.saasSubscription.create({ data: { companyId, plan: "RESEAU", status: "ACTIVE", seatQuantity: 10 } })
    const channel = await prisma.communicationChannel.create({ data: { companyId, provider: "RESEND", emailAddress: "fictional-mailbox@example.test", visibility: "SHARED", status: "DISCONNECTED" } })
    const client = await prisma.client.create({ data: { companyId, name: "Fictional Communications client" } })
    const contact = await prisma.contact.create({ data: { clientId: client.id, firstName: "Fictional", lastName: "Sender", email: "fictional-sender@example.test" } })
    await prisma.emailThread.create({ data: { companyId, channelId: channel.id, clientId: client.id, contactId: contact.id, subject: "UIQA Read-only Communications", unreadCount: 1,
      messages: { create: { companyId, provider: "RESEND", direction: "INBOUND", fromAddress: contact.email, toAddresses: [channel.emailAddress], subject: "UIQA Read-only message", bodyText: "Fictional retained message", status: "RECEIVED" } },
    } })
    for (const role of ["OPERATIONS", "SERVICE", "SALES"]) {
      const user = await prisma.user.create({ data: { companyId, email: `communications-${role.toLowerCase()}-${surface}@example.test`, emailVerified: new Date(), passwordHash } })
      await prisma.membership.create({ data: { companyId, userId: user.id, role, status: "ACTIVE" } })
      await prisma.emailDraft.create({ data: { companyId, authorUserId: user.id, createKey: randomUUID(), requestKey: randomUUID(), channelId: channel.id, contactId: contact.id,
        subject: `UIQA Access private draft ${role}`, bodyHtml: "<p>Fictional retained personal draft</p>", purpose: "SERVICE", cc: [], bcc: [],
      } })
    }
  }
}
