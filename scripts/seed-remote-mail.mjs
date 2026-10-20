// Recorded observations only. This disconnected fictional mailbox has no
// credentials and cannot contact a provider during browser qualification.
export async function seedRemoteMail(prisma, companyId, userId) {
  const channelId = "cuiqaremotemailbox0000000", threadId = "cuiqaremotemailthread0000"
  await prisma.communicationChannel.upsert({ where: { id: channelId }, update: {}, create: { id: channelId, companyId, ownerUserId: userId,
    provider: "GOOGLE", emailAddress: "remote-observed@example.test", displayName: "Boîte fictive à reconnecter", visibility: "PRIVATE", status: "DISCONNECTED" } })
  await prisma.emailThread.upsert({ where: { id: threadId }, update: {}, create: { id: threadId, companyId, channelId, subject: "UIQA Remote observation", status: "CLOSED", unreadCount: 0 } })
  const files = [{ id: "fictional-pdf", name: "document-fictif.pdf", type: "application/pdf", size: 32, kind: "GMAIL_ATTACHMENT", inline: false },
    { id: "fictional-zip", name: "archive-fictive.zip", type: "application/zip", size: 64, kind: "GMAIL_ATTACHMENT", inline: false }]
  for (const [index, subject, presence] of [[0, "UIQA Remote observed", "PRESENT"], [1, "UIQA Remote missing", "MISSING"], [2, "UIQA Remote legacy", null]]) {
    const id = `cuiqaremotemessage${String(index).padStart(8, "0")}`
    await prisma.emailMessage.upsert({ where: { id }, update: {}, create: { id, companyId, threadId, provider: "GOOGLE", providerId: `${channelId}:fictional-${index}`, direction: "INBOUND",
      fromAddress: "sender@example.test", toAddresses: ["remote-observed@example.test"], bccAddresses: ["hidden-remote@example.test"], subject, bodyText: `Fictional retained copy ${index}`, status: "RECEIVED",
      createdAt: new Date(Date.UTC(2026, 0, 5, 10, index)), receivedAt: new Date(Date.UTC(2026, 0, 5, 10, index)),
      ...(presence ? { remoteObservation: { presence, read: presence === "PRESENT" ? false : null, folderIds: presence === "PRESENT" ? ["INBOX"] : [], folderNames: presence === "PRESENT" ? ["Réception"] : [],
        checkedAt: "2026-01-05T12:00:00.000Z", attachments: files, attachmentsComplete: true } } : {}),
    } })
  }
}
