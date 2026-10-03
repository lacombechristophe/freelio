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
  await prisma.contract.upsert({ where: { companyId_number: { companyId, number: "UIQA-CONTRACT" } }, update: {}, create: { companyId, clientId: "cuiqaclient00000000000000", number: "UIQA-CONTRACT", title: "Contrat de recette", content: "<h2>Prestations</h2><p>Installation et contrôle des équipements du client.</p>" } })
  await prisma.contract.upsert({ where: { companyId_number: { companyId, number: "UIQA-SIGNED" } }, update: {}, create: { id: "cuiqacontractsigned000000", companyId, clientId: "cuiqaclient00000000000000", number: "UIQA-SIGNED", title: "Contrat signé de recette", status: "SIGNED", content: "<h2>Maintenance</h2><p>Contrat fictif destiné au contrôle du formulaire d’avenant.</p>" } })
  const supplier = await prisma.supplier.upsert({ where: { companyId_name: { companyId, name: "Fournisseur de recette UI" } }, update: {}, create: { id: "cuiqasupplier000000000000", companyId, name: "Fournisseur de recette UI", email: "supplier@example.test" } })
  await prisma.purchaseOrder.upsert({ where: { companyId_number: { companyId, number: "UIQA-PURCHASE" } }, update: {}, create: { id: "cuiqapurchase000000000000", companyId, supplierId: supplier.id, number: "UIQA-PURCHASE" } })
  await prisma.migrationRun.upsert({ where: { id: "cuiqamigration0000000000" }, update: {}, create: { id: "cuiqamigration0000000000", companyId, provider: "MANUAL", kind: "IMPORT", status: "PENDING" } })
  const mailbox = await prisma.communicationChannel.findFirstOrThrow({ where: { companyId, provider: "RESEND", status: "ACTIVE" } })
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
