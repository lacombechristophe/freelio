import { PrismaClient } from "@prisma/client"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
import { encrypt } from "../src/lib/crypto.ts"

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
  // Fictitious existing bytes, never generated again by the email composer.
  for (let index = 0; index < 31; index++) {
    const id = `cuiqacrmfile${String(index).padStart(14, "0")}`
    const name = `UIQA CRM Document ${String(index).padStart(3, "0")}.pdf`
    const key = `${companyId}/client/${recipientClientId}/uiqa-crm-${index}.pdf`
    const bytes = Buffer.from(`%PDF-fictional existing client document ${index}`)
    const target = path.join(process.cwd(), "data", "files", key)
    await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, bytes)
    const data = { clientId: recipientClientId, name, url: `local:${key}`, size: bytes.length, type: "application/pdf", sha256: createHash("sha256").update(bytes).digest("hex"), createdAt: new Date(Date.UTC(2020, 0, 1, 0, index)) }
    await prisma.clientFile.upsert({ where: { id }, update: data, create: { id, ...data } })
  }
  const archivedInvoiceId = "cuiqacrminvoicearchive000"
  const archiveKey = `${companyId}/generated/${archivedInvoiceId}/uiqa-crm-invoice.pdf`
  const archiveBytes = Buffer.from("%PDF-fictional immutable UIQA CRM invoice archive")
  const archiveTarget = path.join(process.cwd(), "data", "files", archiveKey)
  await mkdir(path.dirname(archiveTarget), { recursive: true }); await writeFile(archiveTarget, archiveBytes)
  const archiveData = { companyId, clientId: recipientClientId, number: "UIQA-CRM-ARCHIVE", object: "Fictional archived invoice", status: "SENT", lockedAt: new Date("2020-01-01"), date: new Date("2020-01-01"), createdAt: new Date("2020-01-01"), dueDate: new Date("2026-12-31"), totalHtCents: 10000, totalTvaCents: 2000, totalTtcCents: 12000, pdfUrl: `local:${archiveKey}`, pdfHash: createHash("sha256").update(archiveBytes).digest("hex"), issuedDocument: encrypt(JSON.stringify({ version: 1, html: "<p>Fictional frozen invoice</p>", xml: "<fiction />" })) }
  await prisma.invoice.upsert({ where: { id: archivedInvoiceId }, update: archiveData, create: { id: archivedInvoiceId, ...archiveData } })
  for (let index = 0; index < 31; index++) {
    const id = `cuiqacrmquote${String(index).padStart(12, "0")}`
    const versionId = `cuiqacrmquoteversion${String(index).padStart(5, "0")}`
    const sectionId = `cuiqacrmquotesection${String(index).padStart(5, "0")}`
    const number = `UIQA-CRM-QUOTE-${String(index).padStart(3, "0")}`
    const data = { companyId, clientId: recipientClientId, number, object: "Fictional current quote for private email copy", status: "DRAFT", date: new Date("2020-01-01"), createdAt: new Date(Date.UTC(2020, 0, 1, 0, index)), updatedAt: new Date(Date.UTC(2020, 0, 1, 0, index)) }
    await prisma.quote.upsert({ where: { id }, update: data, create: { id, ...data } })
    const totals = { totalHtCents: 10000, totalTvaCents: 2000, totalTtcCents: 12000 }
    await prisma.quoteVersion.upsert({ where: { id: versionId }, update: totals, create: { id: versionId, quoteId: id, version: 1, ...totals } })
    await prisma.quoteSection.upsert({ where: { id: sectionId }, update: {}, create: { id: sectionId, versionId, order: 0 } })
    const line = { sectionId, label: "Fictional installation", quantity: 1, unitPriceCents: 10000, tvaRate: 20, order: 0 }
    await prisma.quoteLine.upsert({ where: { id: `cuiqacrmquoteline${String(index).padStart(8, "0")}` }, update: line, create: { id: `cuiqacrmquoteline${String(index).padStart(8, "0")}`, ...line } })
  }
  // Explicit synthetic archives, distinct from historical signed documents below.
  for (let index = 0; index < 31; index++) {
    const id = `cuiqacrmcontract${String(index).padStart(9, "0")}`, number = `UIQA-CRM-CONTRACT-${String(index).padStart(3, "0")}`
    const signedAt = new Date(Date.UTC(2020, 0, 1, 0, index)), key = `${companyId}/generated/${id}/fictional-signed-contract.pdf`
    const bytes = Buffer.from(`%PDF-fictional immutable signed contract ${index}`), target = path.join(process.cwd(), "data", "files", key)
    await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, bytes)
    const signedDocument = encrypt(JSON.stringify({ version: 1, contractId: id, companyId, clientId: recipientClientId, html: `<p>Fictional captured signed contract ${index}</p>`, content: `<p>Fictional captured agreement ${index}</p>`, documentHash: createHash("sha256").update(`fictional presented contract ${index}`).digest("hex"), signedAt: signedAt.toISOString() }))
    const data = { companyId, clientId: recipientClientId, number, title: `Fictional archived agreement ${index}`, content: "Fictional original source", status: "SIGNED", createdAt: signedAt, signedDocument, pdfUrl: `local:${key}`, pdfHash: createHash("sha256").update(bytes).digest("hex"), archiveStatus: "READY", archiveAttempts: 1, archiveNextAttemptAt: null }
    await prisma.contract.upsert({ where: { id }, update: data, create: { id, ...data } })
    const signature = { contractId: id, signerName: "Fictional signatory", signerEmail: "recette0@example.test", signedAt }
    await prisma.contractSignature.upsert({ where: { id: `cuiqacrmcontractsign${String(index).padStart(5, "0")}` }, update: signature, create: { id: `cuiqacrmcontractsign${String(index).padStart(5, "0")}`, ...signature } })
  }
  for (const surface of ["desktop", "mobile"]) {
    const id = `cuiqacontractfreeze${surface}`, data = { companyId, clientId: recipientClientId, number: `UIQA-FROZEN-${surface.toUpperCase()}`, title: "Fictional signing capture", content: "<p>Agreement for {{client.name}} from {{entreprise.name}}.</p>", status: "DRAFT", signedDocument: null, pdfUrl: null, pdfHash: null, archiveStatus: null, archiveAttempts: 0, archiveNextAttemptAt: null, archiveError: null, createdAt: new Date("2020-01-01") }
    await prisma.contractSigningToken.deleteMany({ where: { contractId: id } }); await prisma.contractSignature.deleteMany({ where: { contractId: id } })
    await prisma.contract.upsert({ where: { id }, update: data, create: { id, ...data } })
  }
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
