import { PrismaClient } from "@prisma/client"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { createHash, randomUUID } from "node:crypto"
import { hashPassword } from "../src/lib/auth/password-core.ts"
import { encrypt } from "../src/lib/crypto.ts"
import { seedCatalogueAssets } from "./seed-catalogue-assets.mjs"
import { seedDocumentRelations } from "./seed-document-relations.mjs"
import { seedRecurringInvoices } from "./seed-recurring-invoices.mjs"
import { seedOperationsOrderFinance } from "./seed-operations-order-finance.mjs"
import { seedOperationsOrderDirectory } from "./seed-operations-order-directory.mjs"
import { seedOrderBillingAccounting } from "./seed-order-billing-accounting.mjs"
import { seedDocumentCalendarDates } from "./seed-document-calendar-dates.mjs"
import { seedOrganisationPermissions } from "./seed-organisation-permissions.mjs"

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
  await seedCatalogueAssets(prisma, await hashPassword(process.env.E2E_USER_PASSWORD || "RecetteSolide2026"))
  await seedDocumentRelations(prisma, await hashPassword(process.env.E2E_USER_PASSWORD || "RecetteSolide2026"))
  await seedRecurringInvoices(prisma, await hashPassword(process.env.E2E_USER_PASSWORD || "RecetteSolide2026"))
  await seedOperationsOrderFinance(prisma, await hashPassword(process.env.E2E_USER_PASSWORD || "RecetteSolide2026"))
  await seedOperationsOrderDirectory(prisma, await hashPassword(process.env.E2E_USER_PASSWORD || "RecetteSolide2026"))
  await seedOrderBillingAccounting(prisma, await hashPassword(process.env.E2E_USER_PASSWORD || "RecetteSolide2026"))
  await seedDocumentCalendarDates(prisma, await hashPassword(process.env.E2E_USER_PASSWORD || "RecetteSolide2026"))
  await seedOrganisationPermissions(prisma, await hashPassword(process.env.E2E_USER_PASSWORD || "RecetteSolide2026"))
  for (const surface of ["desktop", "mobile"]) {
    await prisma.supplier.createMany({ data: Array.from({ length: 201 }, (_, index) => ({
      companyId, name: `UIQA Supplier ${surface} ${String(index).padStart(3, "0")}`, code: `UIQA-SUP-${surface}-${index}`, contactName: "Fictional supplier contact",
    })) })
  }
  for (const surface of ["desktop", "mobile"]) {
    // Keep this volume out of the other suites' shared stock and catalogue.
    // Each surface still reads all 301 products and 101 orders/returns.
    const historyCompany = await prisma.company.create({ data: { name: `Fictional supplier history ${surface}` } })
    const historyCompanyId = historyCompany.id
    const passwordHash = await hashPassword(process.env.E2E_USER_PASSWORD || "RecetteSolide2026")
    const historyUser = await prisma.user.create({ data: { companyId: historyCompanyId, email: `supplier-history-${surface}@example.test`, name: "Fictional supplier history reader", emailVerified: new Date(), passwordHash } })
    await prisma.membership.create({ data: { companyId: historyCompanyId, userId: historyUser.id, role: "OWNER", status: "ACTIVE" } })
    await prisma.saasSubscription.create({ data: { companyId: historyCompanyId, plan: "RESEAU", status: "ACTIVE", seatQuantity: 30 } })
    const supplier = await prisma.supplier.create({ data: { companyId: historyCompanyId, name: `UIQA Supplier history ${surface}` } })
    const warehouse = await prisma.warehouse.create({ data: { companyId: historyCompanyId, code: `UIQA-HISTORY-${surface}`, name: `Fictional history warehouse ${surface}` } })
    await prisma.product.createMany({ data: Array.from({ length: 301 }, (_, index) => ({ companyId: historyCompanyId, supplierId: supplier.id, sku: `UIQA-HISTORY-${surface}-${String(index).padStart(3, "0")}`, label: `UIQA History product ${surface} ${String(index).padStart(3, "0")}`, active: index !== 300 })) })
    const product = await prisma.product.findFirstOrThrow({ where: { companyId: historyCompanyId, supplierId: supplier.id }, orderBy: { sku: "asc" } })
    await prisma.purchaseOrder.createMany({ data: Array.from({ length: 101 }, (_, index) => ({ companyId: historyCompanyId, supplierId: supplier.id, number: `UIQA-HISTORY-${surface}-${String(index).padStart(3, "0")}`, totalHtCents: 1000, status: index === 100 ? "CANCELED" : "RECEIVED", orderDate: new Date(Date.UTC(1995, 0, 101 - index)), receivedAt: index === 100 ? null : new Date("1995-06-15"), expectedAt: new Date(index % 2 === 0 ? "1995-06-16" : "1995-06-14") })) })
    const orders = await prisma.purchaseOrder.findMany({ where: { companyId: historyCompanyId, supplierId: supplier.id }, orderBy: { number: "asc" } })
    await prisma.purchaseOrderLine.createMany({ data: orders.map(order => ({ purchaseOrderId: order.id, productId: product.id, label: "Fictional history line", quantity: 1, receivedQuantity: 1, unitPriceCents: 1000 })) })
    const lines = await prisma.purchaseOrderLine.findMany({ where: { purchaseOrder: { companyId: historyCompanyId, supplierId: supplier.id } } })
    await prisma.purchaseIssue.createMany({ data: orders.map((order, index) => ({ companyId: historyCompanyId, purchaseOrderId: order.id, purchaseOrderLineId: lines.find(line => line.purchaseOrderId === order.id).id, type: "DAMAGE", quantity: 1, status: index === 100 ? "OPEN" : "RESOLVED" })) })
    await prisma.stockMovement.createMany({ data: orders.map(order => ({ companyId: historyCompanyId, warehouseId: warehouse.id, productId: product.id, type: "RETURN", quantity: -1, reference: order.number })) })
    const movements = await prisma.stockMovement.findMany({ where: { companyId: historyCompanyId, warehouseId: warehouse.id } })
    await prisma.supplierReturn.createMany({ data: orders.map((order, index) => ({ companyId: historyCompanyId, supplierId: supplier.id, warehouseId: warehouse.id, productId: product.id, purchaseOrderId: order.id, purchaseOrderLineId: lines.find(line => line.purchaseOrderId === order.id).id, stockMovementId: movements.find(movement => movement.reference === order.number).id, number: `UIQA-RETURN-${surface}-${String(index).padStart(3, "0")}`, quantity: 1, unitCostCents: 1000, reason: "Fictional history", creditReference: index === 100 ? `UIQA-OLDEST-CREDIT-${surface}` : null, shippedAt: order.orderDate })) })
  }
  for (const surface of ["desktop", "mobile"]) {
    const clientCompany = await prisma.company.create({ data: { name: `Fictional client permissions ${surface}` } })
    const permitted = await prisma.agency.create({ data: { companyId: clientCompany.id, code: "PERMITTED", name: "Fictional assigned agency" } })
    const other = await prisma.agency.create({ data: { companyId: clientCompany.id, code: "OTHER", name: "Fictional other agency" } })
    await prisma.saasSubscription.create({ data: { companyId: clientCompany.id, plan: "RESEAU", status: "ACTIVE", seatQuantity: 30 } })
    const passwordHash = await hashPassword(process.env.E2E_USER_PASSWORD || "RecetteSolide2026")
    for (const role of ["OWNER", "TECHNICIAN", "SALES"]) {
      const reader = await prisma.user.create({ data: { companyId: clientCompany.id, email: `client-reader-${role.toLowerCase()}-${surface}@example.test`, name: `Fictional ${role} reader`, emailVerified: new Date(), passwordHash } })
      const membership = await prisma.membership.create({ data: { companyId: clientCompany.id, userId: reader.id, role, status: "ACTIVE" } })
      await prisma.agencyMembership.create({ data: { agencyId: permitted.id, membershipId: membership.id } })
    }
    const client = await prisma.client.create({ data: { companyId: clientCompany.id, name: `UIQA Client permissions ${surface}`, totalRevenueCents: 999999, totalUnpaidCents: 888888 } })
    for (const [marker, agencyId] of [["PERMITTED", permitted.id], ["OTHER", other.id]]) {
      const project = await prisma.project.create({ data: { companyId: clientCompany.id, clientId: client.id, agencyId, name: `UIQA Client project ${marker}` } })
      await prisma.quote.create({ data: { companyId: clientCompany.id, clientId: client.id, projectId: project.id, number: `UIQA-CLIENT-QUOTE-${marker}`, object: "Fictional quote", versions: { create: { version: 1, totalHtCents: 1000, totalTvaCents: 0, totalTtcCents: 1000 } } } })
      await prisma.invoice.create({ data: { companyId: clientCompany.id, clientId: client.id, projectId: project.id, number: `UIQA-CLIENT-INVOICE-${marker}`, object: "Fictional invoice", dueDate: new Date("2030-01-01"), status: "PAID", totalHtCents: 1000, totalTvaCents: 0, totalTtcCents: 1000, paidAmountCents: 1000 } })
    }
  }
  for (const surface of ["desktop", "mobile"]) {
    const healthCompany = await prisma.company.create({ data: { name: `Fictional customer success permissions ${surface}` } })
    const permitted = await prisma.agency.create({ data: { companyId: healthCompany.id, code: "PERMITTED", name: "Fictional assigned agency" } })
    const other = await prisma.agency.create({ data: { companyId: healthCompany.id, code: "OTHER", name: "Fictional other agency" } })
    await prisma.saasSubscription.create({ data: { companyId: healthCompany.id, plan: "RESEAU", status: "ACTIVE", seatQuantity: 30 } })
    const passwordHash = await hashPassword(process.env.E2E_USER_PASSWORD || "RecetteSolide2026")
    for (const role of ["OWNER", "TECHNICIAN", "SERVICE", "VIEWER"]) {
      const reader = await prisma.user.create({ data: { companyId: healthCompany.id, email: `success-reader-${role.toLowerCase()}-${surface}@example.test`, name: `Fictional ${role} success reader`, emailVerified: new Date(), passwordHash } })
      const membership = await prisma.membership.create({ data: { companyId: healthCompany.id, userId: reader.id, role, status: "ACTIVE" } })
      await prisma.agencyMembership.create({ data: { agencyId: permitted.id, membershipId: membership.id } })
    }
    const client = await prisma.client.create({ data: { companyId: healthCompany.id, name: `UIQA Success permissions ${surface}`, renewalAmountCents: 12345, relationScore: 37, createdAt: new Date("2020-01-01") } })
    await prisma.customerHealthRule.create({ data: { companyId: healthCompany.id, name: `UIQA Financial health ${surface}`, metric: "OVERDUE_BALANCE_CENTS", operator: "GTE", threshold: 1, impact: -60 } })
    await prisma.customerHealthSnapshot.create({ data: { companyId: healthCompany.id, clientId: client.id, score: 35, status: "RISK", factors: [], computedAt: new Date("2020-01-01") } })
    for (const [marker, agencyId, amount] of [["PERMITTED", permitted.id, 321], ["OTHER", other.id, 700]]) {
      const project = await prisma.project.create({ data: { companyId: healthCompany.id, clientId: client.id, agencyId, name: `UIQA Success project ${marker}` } })
      await prisma.invoice.create({ data: { companyId: healthCompany.id, clientId: client.id, projectId: project.id, number: `UIQA-SUCCESS-${marker}`, object: "Fictional success invoice", dueDate: new Date("2020-01-01"), status: "SENT", totalHtCents: amount, totalTvaCents: 0, totalTtcCents: amount } })
    }
  }
  for (const surface of ["desktop", "mobile"]) {
    await prisma.notification.create({ data: { userId: user.id, type: "SYSTEM", title: `UIQA Notification hydration ${surface}`, message: "Fictional hydration regression", isRead: true } })
    const workflow = await prisma.automationWorkflow.create({ data: { companyId, name: `UIQA Journal ${surface}`, trigger: "LEAD_CREATED", status: "ARCHIVED", actions: [{ type: "WAIT", delayHours: 1 }] } })
    await prisma.automationRun.createMany({ data: Array.from({ length: 101 }, (_, index) => ({ companyId, workflowId: workflow.id, event: index === 100 ? `UIQA_LAST_${surface}` : "LEAD_CREATED",
      eventKey: `fictional-journal-${surface}-${index}`, subjectModel: "LeadCapture", subjectId: "fictional-journal-subject", status: "COMPLETED", startedAt: new Date(Date.UTC(1990, 0, 1, 0, index)) })) })
  }
  for (const surface of ["desktop", "mobile"]) {
    const subject = `UIQA Expired Retry ${surface}`
    const lead = await prisma.leadCapture.create({ data: { companyId, firstName: "Fiction", lastName: "Expired retry", email: `expired-retry-${surface}@example.test`, privacyAccepted: true, fingerprint: subject, source: "ISOLATED_RETRY_E2E" } })
    const sequence = await prisma.emailSequence.create({ data: { companyId, name: subject, status: "ACTIVE", steps: { create: { position: 0, subject, bodyHtml: "<p>Fictional uncertain result</p>" } } }, include: { steps: true } })
    const enrollment = await prisma.emailSequenceEnrollment.create({ data: { sequenceId: sequence.id, leadCaptureId: lead.id, status: "PAUSED", stopReason: "DELIVERY_RESULT_UNCERTAIN" } })
    await prisma.emailDelivery.create({ data: { companyId, sequenceId: sequence.id, enrollmentId: enrollment.id, stepId: sequence.steps[0].id, leadCaptureId: lead.id, recipientEmail: lead.email, subject,
      provider: "RESEND", status: "DEAD_LETTER", attempts: 2, firstAttemptAt: new Date(Date.now() - 24 * 3_600_000), scheduledAt: new Date(), createdAt: new Date("2040-01-01T00:00:00Z") } })
  }
  for (let index = 0; index < 27; index++) await prisma.marketingCampaign.upsert({ where: { companyId_name: { companyId, name: `UIQA Campaign management volume ${index}` } }, update: {}, create: { companyId, name: `UIQA Campaign management volume ${index}`, objective: "Fictional pagination", channels: ["EMAIL"], createdAt: new Date(Date.UTC(2000, 0, 1, 0, index)) } })
  for (const surface of ["desktop", "mobile"]) {
    const name = `UIQA Campaign management ${surface}`
    const campaign = await prisma.marketingCampaign.upsert({ where: { companyId_name: { companyId, name } }, update: {}, create: { companyId, name, objective: "Fictional editable objective", channels: ["EMAIL"], createdAt: new Date(Date.UTC(1990, 0, 1)) } })
    for (let index = 0; index < 27; index++) {
      const id = `cuiqacampaignasset${surface}${String(index).padStart(3, "0")}`
      await prisma.marketingCampaignAsset.upsert({ where: { id }, update: {}, create: { id, campaignId: campaign.id, name: `UIQA editable asset ${surface} ${index}`, type: "EMAIL", createdAt: new Date(Date.UTC(2000, 0, 1, 0, index)) } })
    }
  }
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
  // Explicit evidence for one synthetic marketing recipient; other contacts have none.
  await prisma.contact.update({ where: { id: "cuiqarecipient000000000549" }, data: { marketingStatus: "OPTED_IN" } })
  const consentData = { companyId, clientId: recipientClientId, contactId: "cuiqarecipient000000000549", recipientEmail: "recipient549@example.test", channel: "EMAIL", purpose: "MARKETING", status: "GRANTED", legalBasis: "CONSENT", source: "FICTIONAL_UI_RECIPE", noticeUrl: "https://example.test/privacy", proofHash: createHash("sha256").update("fictional recipient549 proof").digest("hex") }
  await prisma.marketingConsent.upsert({ where: { id: "cuiqamanualmarketingproof" }, update: {}, create: { id: "cuiqamanualmarketingproof", ...consentData } })
  for (const surface of ["desktop", "mobile"]) {
    await prisma.emailDraft.upsert({ where: { id: `cuiqapurposelegacy${surface}` }, update: {}, create: { id: `cuiqapurposelegacy${surface}`, companyId, authorUserId: user.id, createKey: randomUUID(), requestKey: randomUUID(), subject: `UIQA Historical purpose ${surface}`, bodyHtml: "<p>Historical fictional purpose remains unknown</p>", cc: [], bcc: [] } })
  }
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
  for (const surface of ["desktop", "mobile"]) {
    let oldestSequence
    for (let index = 0; index < 201; index++) {
      const suffix = String(index).padStart(3, "0"), updatedAt = new Date(Date.UTC(1995, 0, 1, 0, index))
      if (index < 101) {
        await prisma.emailTemplate.create({ data: { companyId, name: `UIQA Studio model ${surface} ${suffix}`, category: "NURTURE", subject: `Fictional studio ${suffix}`, bodyHtml: "<p>Fictional studio template</p>", updatedAt } })
        await prisma.emailSuppression.create({ data: { companyId, email: `studio-blocked-${surface}-${suffix}@example.test`, reason: "MANUAL", suppressedAt: updatedAt } })
      }
      const sequence = await prisma.emailSequence.create({ data: { companyId, senderChannelId: mailbox.id, name: `UIQA Studio sequence ${surface} ${suffix}`, status: "DRAFT", updatedAt } })
      if (!index) oldestSequence = sequence
      await prisma.automationWorkflow.create({ data: { companyId, name: `UIQA Studio workflow ${surface} ${suffix}`, trigger: "LEAD_CREATED", status: "DRAFT", actions: [], updatedAt } })
    }
    for (let index = 0; index < 26; index++) {
      const lead = await prisma.leadCapture.create({ data: { companyId, firstName: "Fiction", lastName: `Studio ${String(index).padStart(3, "0")}`, email: `studio-enrollment-${surface}-${index}@example.test`, privacyAccepted: true, fingerprint: randomUUID() } })
      await prisma.emailSequenceEnrollment.create({ data: { sequenceId: oldestSequence.id, leadCaptureId: lead.id, status: "PAUSED", enrolledAt: new Date(Date.UTC(1995, 0, 1, 0, index)) } })
    }
  }
  for (const surface of ["desktop", "mobile"]) {
    const amountCents = surface === "desktop" ? 912345 : 912346
    const client = await prisma.client.create({ data: { companyId, name: `UIQA Bank client ${surface}` } })
    await prisma.bankTransaction.createMany({ data: Array.from({ length: 251 }, (_, index) => ({
      companyId, label: `UIQA Bank history ${surface} ${String(index).padStart(3, "0")}`, reference: `UIQA Bank reference ${surface} ${index}`,
      date: new Date(Date.UTC(1995, 0, 1, 0, index)), fingerprint: randomUUID(), amountCents: index === 250 ? amountCents : -amountCents,
    })) })
    await prisma.expense.createMany({ data: Array.from({ length: 101 }, (_, index) => ({
      companyId, label: `UIQA Bank expense ${surface} ${String(index).padStart(3, "0")}`, amountCents, category: "Autre", date: new Date(Date.UTC(1995, 0, 1, 0, index)),
    })) })
    await prisma.invoice.createMany({ data: Array.from({ length: 26 }, (_, index) => ({
      companyId, clientId: client.id, number: `UIQA-BANK-${surface}-${String(index).padStart(3, "0")}`, object: "Fictional banking candidate", status: "SENT",
      date: new Date("1995-01-01T12:00:00Z"), dueDate: new Date("1995-02-01T12:00:00Z"), totalHtCents: amountCents * 2, totalTvaCents: 0, totalTtcCents: amountCents * 2,
    })) })
  }
  for (const surface of ["desktop", "mobile"]) for (const kind of ["Unknown", "Accepted"]) {
    const subject = `UIQA Sequence recovery ${kind} ${surface}`
    const lead = await prisma.leadCapture.create({ data: { companyId, firstName: "Fiction", lastName: "Sequence recovery", email: `sequence-recovery-${kind.toLowerCase()}-${surface}@example.test`, privacyAccepted: true, fingerprint: subject } })
    const sequence = await prisma.emailSequence.create({ data: { companyId, senderChannelId: mailbox.id, name: subject, status: "ARCHIVED", steps: { create: { position: 0, subject, bodyHtml: "<p>Fictional sequence original</p>" } } }, include: { steps: true } })
    const enrollment = await prisma.emailSequenceEnrollment.create({ data: { sequenceId: sequence.id, leadCaptureId: lead.id, status: "PAUSED", stopReason: "DELIVERY_RESULT_UNCERTAIN" } })
    await prisma.emailDelivery.create({ data: { companyId, sequenceId: sequence.id, stepId: sequence.steps[0].id, enrollmentId: enrollment.id, leadCaptureId: lead.id, channelId: mailbox.id, provider: "RESEND", recipientEmail: lead.email, subject,
      payload: { kind: "SEQUENCE", companyName: "Fictional company", replyTo: null, from: mailbox.emailAddress, to: lead.email, subject, html: "<p>Fictional sequence original</p>", headers: {} },
      status: kind === "Accepted" ? "SENT" : "DEAD_LETTER", attempts: 2, providerId: kind === "Accepted" ? `fiction-sequence-recovery-${surface}` : null, sentAt: kind === "Accepted" ? new Date("2020-01-01") : null,
      firstAttemptAt: new Date(Date.now() - 86_400_000), scheduledAt: new Date(), createdAt: new Date("2001-01-01") } })
  }
  for (const surface of ["desktop", "mobile"]) {
    const sequences = []
    for (let index = 0; index < 51; index++) sequences.push(await prisma.emailSequence.create({ data: { companyId, senderChannelId: mailbox.id, name: `UIQA Mail selector ${surface} ${String(index).padStart(3, "0")}`, status: "ARCHIVED" } }))
    await prisma.emailDelivery.createMany({ data: Array.from({ length: 101 }, (_, index) => ({ companyId, channelId: mailbox.id, sequenceId: sequences[index % 51].id,
      recipientEmail: `journal-${surface}-${index}@example.test`, subject: `UIQA Mail journal ${surface} ${String(index).padStart(3, "0")}`, status: "FAILED", scheduledAt: new Date("1990-01-01"), createdAt: new Date(Date.UTC(1990, 0, 1, 0, index)) })) })
  }
  for (const surface of ["desktop", "mobile"]) {
    const name = `UIQA Activation ${surface}`
    const client = await prisma.client.create({ data: { companyId, name: `Fictional activation contacts ${surface}` } })
    const segment = await prisma.marketingSegment.create({ data: { companyId, name, kind: "STATIC", filters: {}, lastBuiltAt: new Date() } })
    const campaign = await prisma.marketingCampaign.create({ data: { companyId, segmentId: segment.id, name, objective: "Fictional resumable activation", channels: ["EMAIL"], status: "PLANNED", startAt: new Date("2030-01-01"), createdAt: new Date("1985-01-01") } })
    await prisma.emailSequence.create({ data: { companyId, campaignId: campaign.id, senderChannelId: mailbox.id, name, status: "ACTIVE", businessDaysOnly: false, timezone: "UTC", steps: { create: { position: 0, subject: "Fictional unsent activation", bodyHtml: "<p>Fictional recipe only</p>" } } } })
    for (let index = 0; index < 26; index++) {
      const email = `activation-${surface}-${index}@example.test`
      const contact = await prisma.contact.create({ data: { clientId: client.id, firstName: "Fiction", lastName: `Activation ${index}`, email, marketingStatus: "OPTED_IN" } })
      const lead = await prisma.leadCapture.create({ data: { companyId, clientId: client.id, contactId: contact.id, firstName: "Fiction", lastName: `Activation ${index}`, email, privacyAccepted: true, marketingOptIn: true, fingerprint: `activation-${surface}-${index}` } })
      await prisma.marketingSegmentMember.create({ data: { segmentId: segment.id, leadCaptureId: lead.id } })
      if (index < 24) await prisma.marketingConsent.create({ data: { companyId, clientId: client.id, contactId: contact.id, leadCaptureId: lead.id, recipientEmail: email, channel: "EMAIL", purpose: "MARKETING", status: "GRANTED", legalBasis: "CONSENT", source: "ISOLATED_FICTIONAL_E2E", noticeUrl: "https://example.test/privacy", proofHash: createHash("sha256").update(`fictional-activation-${surface}-${index}`).digest("hex") } })
    }
  }
  const recoveryPayload = subject => ({ userId: user.id, contactId: "cuiqarecipient000000000550", clientId: recipientClientId, threadId: null, serviceTicketId: null, channelId: mailbox.id, companyName: "Fictional recovery recipe", replyTo: null, from: mailbox.emailAddress, to: "recipient550@example.test", subject, html: "<p>Frozen fictional recovery original</p>", text: "Frozen fictional recovery original", cc: [], bcc: ["hidden-recovery@example.test"], attachments: [], purpose: "SERVICE" })
  for (let index = 0; index < 26; index++) {
    const subject = `UIQA Recovery pagination ${index}`, id = `cuiqarecoverypage${String(index).padStart(8, "0")}`
    await prisma.emailDelivery.upsert({ where: { id }, update: {}, create: { id, companyId, manualAuthorUserId: user.id, requestKey: randomUUID(), channelId: mailbox.id, provider: "RESEND", recipientEmail: "recipient550@example.test", subject, payload: recoveryPayload(subject), status: "FAILED", attempts: 1, scheduledAt: new Date(), createdAt: new Date(2000, 0, 1, 0, index) } })
  }
  for (const surface of ["desktop", "mobile"]) for (const kind of ["Unknown", "Accepted"]) {
    const subject = `UIQA Recovery ${kind} ${surface}`, requestKey = randomUUID(), id = `cuiqarecovery${kind.toLowerCase()}${surface}`
    const draftId = `cuiqarecoverydraft${kind.toLowerCase()}${surface}`
    await prisma.emailDraft.upsert({ where: { id: draftId }, update: {}, create: { id: draftId, companyId, authorUserId: user.id, createKey: randomUUID(), requestKey, channelId: mailbox.id, contactId: "cuiqarecipient000000000550", subject, bodyHtml: "<p>Frozen fictional recovery original</p>", purpose: "SERVICE", cc: [], bcc: ["hidden-recovery@example.test"] } })
    const draft = await prisma.emailDraft.findUniqueOrThrow({ where: { id: draftId } })
    await prisma.emailDelivery.upsert({ where: { id }, update: {}, create: { id, companyId, manualAuthorUserId: user.id, requestKey: draft.requestKey, channelId: mailbox.id, contactId: "cuiqarecipient000000000550", provider: "RESEND", recipientEmail: "recipient550@example.test", subject, purpose: "SERVICE", payload: recoveryPayload(subject), status: kind === "Accepted" ? "SENT" : "FAILED", attempts: 1, providerId: kind === "Accepted" ? `fiction-recovery-${surface}` : null, sentAt: kind === "Accepted" ? new Date(2020, 0, 1) : null, scheduledAt: new Date(), createdAt: new Date(kind === "Accepted" ? 2021 : 1990, 0, 1) } })
  }
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
