export async function seedVisualQuality(prisma, passwordHash) {
  const companyId = "cuiqavisualqualitycompany", userId = "cuiqavisualqualityuser000"
  await prisma.company.upsert({ where: { id: companyId }, update: {}, create: { id: companyId, name: "👩🏽‍💻 Atelier — démonstration visuelle", logo: "/uiqa-missing-brand-logo.png" } })
  await prisma.user.upsert({ where: { id: userId }, update: {}, create: { id: userId, companyId, email: "visual-quality@example.test", name: "👩🏽‍💻 Élodie", emailVerified: new Date(), passwordHash } })
  await prisma.membership.upsert({ where: { companyId_userId: { companyId, userId } }, update: {}, create: { companyId, userId, role: "OWNER", status: "ACTIVE" } })
  await prisma.saasSubscription.upsert({ where: { companyId }, update: {}, create: { companyId, plan: "RESEAU", status: "ACTIVE", seatQuantity: 5 } })
  const threadId = "cuiqavisualqualitythread0"
  await prisma.emailThread.upsert({ where: { id: threadId }, update: {}, create: { id: threadId, companyId, subject: "UIQA Contraste de conversation", lastMessageAt: new Date("2026-10-25T12:00:00Z") } })
  await prisma.emailMessage.upsert({ where: { id: "cuiqavisualqualitymessage" }, update: {}, create: { id: "cuiqavisualqualitymessage", companyId, threadId, direction: "INBOUND", provider: "DEMO", fromAddress: "client@example.test", toAddresses: ["visual-quality@example.test"], subject: "UIQA Contraste de conversation", bodyText: "Message fictif lisible dans les deux thèmes.", status: "RECEIVED" } })
}
