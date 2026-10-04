import { PrismaClient } from "@prisma/client"

// Only the historical disposable database or the explicitly isolated CI recipe.
const isolatedCi = process.env.CI === "true"
  && process.env.RECIPE_ISOLATED === "true"
  && process.env.E2E_DIRECTORY_FIXTURES === "true"
  && process.env.DATABASE_URL === "file:./e2e-ci.db"
if (process.env.DATABASE_URL !== "file:./redesign-20260928.db" && !isolatedCi) throw new Error("Use the isolated redesign database or the isolated CI recipe.")
const prisma = new PrismaClient()
try {
  const user = await prisma.user.findUniqueOrThrow({ where: { email: "qa-crm@example.com" } })
  const companyId = user.companyId
  if (!companyId) throw new Error("Seed the QA account first.")
  for (let index = 0; index < 125; index++) {
    const id = `cuiqaclient${String(index).padStart(14, "0")}`
    const legacy = await prisma.client.findUnique({ where: { id: `redesign-client-${index}` } })
    if (legacy && legacy.companyId === companyId) await prisma.client.update({ where: { id: legacy.id }, data: { id } })
    const client = await prisma.client.upsert({ where: { id }, update: {}, create: { id, companyId, name: `ZZZ Recette ${String(index).padStart(3, "0")}${index === 124 ? " — Entreprise de construction et maintenance des équipements aquatiques et des installations techniques" : ""}`, createdAt: new Date(Date.UTC(2020, 0, 1, 0, index)), contacts: { create: { firstName: "Camille", lastName: "Recette", email: `recette${index}@example.test`, isPrimary: true } } } })
    if (index >= 55) continue
    const number = `UIQA-${String(index).padStart(3, "0")}`
    await prisma.quote.upsert({ where: { companyId_number: { companyId, number } }, update: {}, create: { companyId, clientId: client.id, number, object: "Installation de contrôle visuel", createdAt: new Date(Date.UTC(2020, 0, 1, 0, index)), versions: { create: { version: 1, totalHtCents: 10000, totalTvaCents: 2000, totalTtcCents: 12000 } } } })
    await prisma.invoice.upsert({ where: { companyId_number: { companyId, number } }, update: {}, create: { companyId, clientId: client.id, number, object: "Prestation de contrôle visuel", dueDate: new Date("2026-12-31"), createdAt: new Date(Date.UTC(2020, 0, 1, 0, index)), totalHtCents: 10000, totalTvaCents: 2000, totalTtcCents: 12000, lines: { create: { label: "Installation", quantity: 1, unitPriceCents: 10000, tvaRate: 20 } } } })
  }
  // Recipient pagination reuses a fictional client without growing the health portfolio.
  const recipientClientId = "cuiqaclient00000000000000"
  const existingRecipients = new Set((await prisma.contact.findMany({ where: { clientId: recipientClientId, firstName: "UIQA Recipient" }, select: { id: true } })).map(contact => contact.id))
  await prisma.contact.createMany({ data: Array.from({ length: 551 }, (_, index) => ({ id: `cuiqarecipient${String(index).padStart(12, "0")}`, clientId: recipientClientId, firstName: "UIQA Recipient", lastName: String(index).padStart(3, "0"), email: `recipient${index}@example.test` })).filter(contact => !existingRecipients.has(contact.id)) })
  await prisma.contract.upsert({ where: { companyId_number: { companyId, number: "UIQA-CONTRACT" } }, update: {}, create: { companyId, clientId: "cuiqaclient00000000000000", number: "UIQA-CONTRACT", title: "Contrat de recette", content: "<h2>Prestations</h2><p>Installation et contrôle des équipements du client.</p>" } })
  await prisma.contract.upsert({ where: { companyId_number: { companyId, number: "UIQA-SIGNED" } }, update: {}, create: { id: "cuiqacontractsigned000000", companyId, clientId: "cuiqaclient00000000000000", number: "UIQA-SIGNED", title: "Contrat signé de recette", status: "SIGNED", content: "<h2>Maintenance</h2><p>Contrat fictif destiné au contrôle du formulaire d’avenant.</p>" } })
  const supplier = await prisma.supplier.upsert({ where: { companyId_name: { companyId, name: "Fournisseur de recette UI" } }, update: {}, create: { id: "cuiqasupplier000000000000", companyId, name: "Fournisseur de recette UI", email: "supplier@example.test" } })
  await prisma.purchaseOrder.upsert({ where: { companyId_number: { companyId, number: "UIQA-PURCHASE" } }, update: {}, create: { id: "cuiqapurchase000000000000", companyId, supplierId: supplier.id, number: "UIQA-PURCHASE" } })
  await prisma.migrationRun.upsert({ where: { id: "cuiqamigration0000000000" }, update: {}, create: { id: "cuiqamigration0000000000", companyId, provider: "MANUAL", kind: "IMPORT", status: "PENDING" } })
  const mailbox = await prisma.communicationChannel.findFirstOrThrow({ where: { companyId, provider: "RESEND", status: "ACTIVE", id: { not: "cuiqareplysecondmailbox00" } } })
  await prisma.communicationChannel.upsert({ where: { id: "cuiqareplysecondmailbox00" }, update: {}, create: { id: "cuiqareplysecondmailbox00", companyId, provider: "RESEND", emailAddress: "second@example.test", displayName: "Boîte fictive secondaire", status: "ACTIVE" } })
  const disconnected = await prisma.communicationChannel.upsert({ where: { id: "cuiqareplydisconnected00" }, update: {}, create: { id: "cuiqareplydisconnected00", companyId, provider: "RESEND", emailAddress: "disconnected@example.test", displayName: "Boîte fictive déconnectée", status: "DISCONNECTED" } })
  for (const [index, channelId, subject] of [[0, mailbox.id, "UIQA Native reply"], [1, disconnected.id, "UIQA Disconnected reply"]]) {
    const id = `cuiqareplythread${String(index).padStart(10, "0")}`
    await prisma.emailThread.upsert({ where: { id }, update: {}, create: { id, companyId, channelId, clientId: recipientClientId, contactId: "cuiqarecipient000000000550", subject } })
    await prisma.emailMessage.upsert({ where: { id: `cuiqareplymessage${String(index).padStart(9, "0")}` }, update: {}, create: { id: `cuiqareplymessage${String(index).padStart(9, "0")}`, companyId, threadId: id, direction: "INBOUND", provider: "RESEND", providerId: `fixture-reply-${index}`, internetMessageId: `<fixture-reply-${index}@example.test>`, fromAddress: "recipient550@example.test", toAddresses: [index ? disconnected.emailAddress : mailbox.emailAddress], subject, bodyText: "Données fictives de recette de réponse", status: "RECEIVED" } })
  }
  const replyAllThreadId = "cuiqareplyallthread000000"
  const replyAllSubject = "UIQA Reply all paginated"
  await prisma.emailThread.upsert({ where: { id: replyAllThreadId }, update: {}, create: { id: replyAllThreadId, companyId, channelId: mailbox.id, clientId: recipientClientId, contactId: "cuiqarecipient000000000550", subject: replyAllSubject } })
  await prisma.emailMessage.upsert({ where: { id: "cuiqareplyallincoming0000" }, update: {}, create: { id: "cuiqareplyallincoming0000", companyId, threadId: replyAllThreadId, direction: "INBOUND", provider: "RESEND", internetMessageId: "<reply-all-incoming@example.test>",
    fromAddress: "recipient550@example.test", toAddresses: [mailbox.emailAddress, "Copy@example.test", "recipient550@example.test"], ccAddresses: ["copy@example.test", '"Fiction, Other" <Other@example.test>'], bccAddresses: ["hidden@example.test"], subject: replyAllSubject, bodyText: "Incoming copies outside the displayed page", createdAt: new Date("2020-01-01"), status: "RECEIVED" } })
  for (let index = 0; index < 30; index++) {
    const id = `cuiqareplyalloutgoing${String(index).padStart(4, "0")}`
    await prisma.emailMessage.upsert({ where: { id }, update: {}, create: { id, companyId, threadId: replyAllThreadId, direction: "OUTBOUND", provider: "RESEND", fromAddress: mailbox.emailAddress, toAddresses: ["recipient550@example.test"], ccAddresses: ["outgoing-only@example.test"], subject: replyAllSubject, bodyText: `Fictional outgoing ${index}`, createdAt: new Date(Date.UTC(2020, 1, 1, 0, index)), status: "SENT" } })
  }
  for (let index = 0; index < 125; index++) {
    const id = `cuiqainbox${String(index).padStart(15, "0")}`
    await prisma.emailThread.upsert({ where: { id }, update: {}, create: { id, companyId, channelId: mailbox.id, subject: `UIQA Inbox ${String(index).padStart(3, "0")}`, lastMessageAt: new Date(Date.UTC(2020, 0, 1, 0, index)) } })
  }
  await prisma.emailThread.upsert({ where: { id: "cuiqainboxarchive000000000" }, update: {}, create: { id: "cuiqainboxarchive000000000", companyId, channelId: mailbox.id, subject: "UIQA Archived conversation", status: "ARCHIVED" } })
  await prisma.emailThread.upsert({ where: { id: "cuiqainboxunread0000000000" }, update: {}, create: { id: "cuiqainboxunread0000000000", companyId, channelId: mailbox.id, subject: "UIQA Unread conversation", unreadCount: 1 } })
  const longThread = await prisma.emailThread.upsert({ where: { id: "cuiqainboxhistory000000000" }, update: {}, create: { id: "cuiqainboxhistory000000000", companyId, channelId: mailbox.id, subject: "UIQA Long history" } })
  for (let index = 0; index < 101; index++) {
    const id = `cuiqainboxmessage${String(index).padStart(9, "0")}`
    await prisma.emailMessage.upsert({ where: { id }, update: {}, create: { id, companyId, threadId: longThread.id, direction: "INBOUND", provider: "RESEND", fromAddress: "fixture@example.test", toAddresses: [mailbox.emailAddress], subject: `UIQA History ${String(index).padStart(3, "0")}`, bodyText: `Fictitious message ${index}`, createdAt: new Date(Date.UTC(2020, 0, 1, 0, index)), status: "RECEIVED" } })
  }
  console.log("QA fixtures ready: directories, documents, signed contract, supplier, purchase, migration and paginated inbox.")
} finally { await prisma.$disconnect() }
