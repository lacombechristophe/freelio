import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

const identity = vi.hoisted(() => ({
  companyId: "",
  userId: "",
}))

vi.mock("@/auth", () => ({ auth: vi.fn(async () => ({ user: { id: identity.userId }, companyId: identity.companyId })) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("server-only", () => ({}))

import { analyzeMigrationRun, importMigrationRun, simulateMigrationRun, verifyMigrationRun } from "@/actions/migrations"
import prisma from "@/lib/prisma"

describe.sequential("migration database pipeline", () => {
  let runId = ""
  const objectTypes = ["companies", "contacts", "projects", "invoices", "line_items", "payments"] as const

  beforeAll(async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const company = await prisma.company.create({ data: { name: `Migration QA ${suffix}` } })
    const user = await prisma.user.create({ data: { email: `migration-${suffix}@example.test`, companyId: company.id } })
    await prisma.membership.create({ data: { companyId: company.id, userId: user.id, role: "OWNER", status: "ACTIVE" } })
    identity.companyId = company.id
    identity.userId = user.id

    const run = await prisma.migrationRun.create({ data: { companyId: company.id, provider: "EXTRABAT", kind: "MANUAL_ARCHIVE", status: "ANALYZED" } })
    runId = run.id
    const records = [
      { objectType: "companies", sourceId: "client-100", payload: { name: "Résidence du Lac", address: "1 avenue des Pins", city: "Toulouse" } },
      { objectType: "contacts", sourceId: "contact-100", payload: { firstname: "Camille", lastname: "Martin", email: "camille@example.fr", association_company_id: "client-100" } },
      { objectType: "projects", sourceId: "project-100", payload: { name: "Rénovation filtration", status: "active", association_company_id: "client-100" } },
      { objectType: "invoices", sourceId: "invoice-100", payload: { number: "F-EXT-100", object: "Rénovation filtration", status: "envoyée", date: "2026-08-01", due_date: "2026-09-01", total_ht: "1 250,50 €", total_tva: "250,10 €", total_ttc: "1 500,60 €", association_company_id: "client-100" } },
      { objectType: "line_items", sourceId: "line-100", payload: { name: "Pompe et mise en service", quantity: "1", unit_price: "1 250,50 €", tva_rate: "20", association_invoice_id: "invoice-100" } },
      { objectType: "payments", sourceId: "payment-100", payload: { amount: "1 500,60 €", date: "2026-08-28", method: "VIREMENT", association_invoice_id: "invoice-100" } },
    ]
    await prisma.sourceRecord.createMany({ data: records.map((record) => ({ companyId: company.id, runId, provider: "EXTRABAT", ...record, checksum: `sha256-${record.sourceId}` })) })
    await prisma.migrationMetric.createMany({ data: objectTypes.map((objectType) => ({ runId, objectType, sourceCount: 1, extracted: 1 })) })
  })

  afterAll(async () => {
    if (!identity.companyId) return
    await prisma.user.updateMany({ where: { id: identity.userId }, data: { companyId: null } })
    await prisma.externalIdMap.deleteMany({ where: { companyId: identity.companyId } })
    await prisma.migrationRun.deleteMany({ where: { companyId: identity.companyId } })
    await prisma.invoicePayment.deleteMany({ where: { invoice: { companyId: identity.companyId } } })
    await prisma.invoiceLine.deleteMany({ where: { invoice: { companyId: identity.companyId } } })
    await prisma.invoice.deleteMany({ where: { companyId: identity.companyId } })
    await prisma.quote.deleteMany({ where: { companyId: identity.companyId } })
    await prisma.project.deleteMany({ where: { companyId: identity.companyId } })
    await prisma.contact.deleteMany({ where: { client: { companyId: identity.companyId } } })
    await prisma.client.deleteMany({ where: { companyId: identity.companyId } })
    await prisma.membership.deleteMany({ where: { companyId: identity.companyId } })
    await prisma.company.deleteMany({ where: { id: identity.companyId } })
    await prisma.user.deleteMany({ where: { id: identity.userId } })
  })

  it("simulates, imports twice without duplicates, then reconciles every source row", async () => {
    await expect(simulateMigrationRun(runId)).resolves.toMatchObject({ success: true, counts: { CLIENT: 1, CONTACT: 1, PROJECT: 1, INVOICE: 1, LINE_ITEM: 1, PAYMENT: 1 } })
    await expect(importMigrationRun(runId)).resolves.toMatchObject({ success: true, status: "IMPORTED", imported: 6, rejected: 0 })
    await expect(importMigrationRun(runId)).resolves.toMatchObject({ success: true, status: "IMPORTED", imported: 6, rejected: 0 })

    const client = await prisma.client.findFirstOrThrow({ where: { companyId: identity.companyId, name: "Résidence du Lac" }, include: { contacts: true, projects: true, invoices: { include: { lines: true, payments: true } } } })
    expect(client.contacts).toHaveLength(1)
    expect(client.projects).toHaveLength(1)
    expect(client.invoices).toHaveLength(1)
    expect(client.invoices[0]).toMatchObject({ number: "F-EXT-100", totalHtCents: 125050, totalTvaCents: 25010, totalTtcCents: 150060, paidAmountCents: 150060, status: "PAID" })
    expect(client.invoices[0].lines).toHaveLength(1)
    expect(client.invoices[0].lines[0]).toMatchObject({ label: "Pompe et mise en service", unitPriceCents: 125050, tvaRate: 20 })
    expect(client.invoices[0].payments).toHaveLength(1)
    expect(await prisma.externalIdMap.count({ where: { companyId: identity.companyId, provider: "EXTRABAT" } })).toBe(6)

    await expect(verifyMigrationRun(runId)).resolves.toMatchObject({ success: true, status: "VERIFIED", records: 6, imported: 6, rejected: 0, blocking: 0 })
  })

  it("detects changed amounts and associations even when source counts still reconcile", async () => {
    const invoice = await prisma.invoice.findFirstOrThrow({ where: { companyId: identity.companyId } })
    const other = await prisma.client.create({ data: { companyId: identity.companyId, name: "Synthetic wrong association" } })
    try {
      await prisma.invoice.update({ where: { id: invoice.id }, data: { totalTtcCents: invoice.totalTtcCents + 1, clientId: other.id } })
      await expect(verifyMigrationRun(runId)).resolves.toMatchObject({ success: false, status: "VERIFICATION_FAILED" })
      expect(await prisma.migrationIssue.count({ where: { runId, code: "VERIFY_AMOUNT_MISMATCH" } })).toBeGreaterThan(0)
      expect(await prisma.migrationIssue.count({ where: { runId, code: "VERIFY_RELATION_MISMATCH" } })).toBeGreaterThan(0)
    } finally {
      await prisma.invoice.update({ where: { id: invoice.id }, data: { totalTtcCents: invoice.totalTtcCents, clientId: invoice.clientId } })
      await prisma.client.delete({ where: { id: other.id } })
    }
    await expect(verifyMigrationRun(runId)).resolves.toMatchObject({ success: true })
  })

  it("detects a deleted imported target despite a surviving mapping", async () => {
    const record = await prisma.sourceRecord.findFirstOrThrow({ where: { runId, objectType: "contacts" } })
    const contact = await prisma.contact.findUniqueOrThrow({ where: { id: record.targetRecordId! } })
    await prisma.contact.delete({ where: { id: contact.id } })
    try {
      await expect(verifyMigrationRun(runId)).resolves.toMatchObject({ success: false })
      expect(await prisma.migrationIssue.count({ where: { runId, code: "VERIFY_TARGET_MISSING" } })).toBe(1)
    } finally {
      const { customFields, ...fields } = contact
      await prisma.contact.create({ data: fields })
      await prisma.contact.update({ where: { id: contact.id }, data: { customFields: customFields as Record<string, string> } })
    }
    await expect(verifyMigrationRun(runId)).resolves.toMatchObject({ success: true })
  })
  it("blocks altered document line sums and paid amount without changing source counts", async () => {
    const invoice = await prisma.invoice.findFirstOrThrow({ where: { companyId: identity.companyId }, include: { lines: true } })
    const line = invoice.lines[0]
    try {
      await prisma.invoiceLine.update({ where: { id: line.id }, data: { quantity: line.quantity + 1 } })
      await prisma.invoice.update({ where: { id: invoice.id }, data: { paidAmountCents: invoice.paidAmountCents - 1 } })
      await expect(verifyMigrationRun(runId)).resolves.toMatchObject({ success: false })
      expect(await prisma.migrationIssue.count({ where: { runId, code: "VERIFY_DOCUMENT_TOTAL_MISMATCH" } })).toBeGreaterThan(0)
      expect(await prisma.migrationIssue.count({ where: { runId, code: "VERIFY_PAYMENT_TOTAL_MISMATCH" } })).toBeGreaterThan(0)
    } finally {
      await prisma.invoiceLine.update({ where: { id: line.id }, data: { quantity: line.quantity } })
      await prisma.invoice.update({ where: { id: invoice.id }, data: { paidAmountCents: invoice.paidAmountCents } })
    }
    await expect(verifyMigrationRun(runId)).resolves.toMatchObject({ success: true })
  })

  it("verifies every materialized line when one source line belongs to a quote and invoice", async () => {
    const run = await prisma.migrationRun.create({ data: { companyId: identity.companyId, provider: "EXTRABAT", kind: "MANUAL_ARCHIVE", status: "SIMULATED" } })
    const rows = [
      { objectType: "quotes", sourceId: "quote-multi", payload: { number: "SYNTHETIC-MULTI-QUOTE", total_ht: "100", total_tva: "20", total_ttc: "120", association_company_id: "client-100" } },
      { objectType: "invoices", sourceId: "invoice-multi", payload: { number: "SYNTHETIC-MULTI-INVOICE", total_ht: "100", total_tva: "20", total_ttc: "120", association_company_id: "client-100" } },
      { objectType: "line_items", sourceId: "line-multi", payload: { name: "Synthetic shared line", quantity: "1", unit_price: "100", tva_rate: "20", association_quote_id: "quote-multi", association_invoice_id: "invoice-multi" } },
    ]
    await prisma.sourceRecord.createMany({ data: rows.map(row => ({ ...row, companyId: identity.companyId, runId: run.id, provider: "EXTRABAT", checksum: "synthetic" })) })
    await prisma.migrationMetric.createMany({ data: rows.map(row => ({ runId: run.id, objectType: row.objectType, sourceCount: 1, extracted: 1 })) })
    await expect(importMigrationRun(run.id)).resolves.toMatchObject({ imported: 3 })
    await expect(verifyMigrationRun(run.id)).resolves.toMatchObject({ success: true })
    const sibling = await prisma.invoiceLine.findFirstOrThrow({ where: { sourceKey: "EXTRABAT:line_items:line-multi", invoice: { companyId: identity.companyId } } })
    await prisma.invoiceLine.delete({ where: { id: sibling.id } })
    try {
      await expect(verifyMigrationRun(run.id)).resolves.toMatchObject({ success: false })
      expect(await prisma.migrationIssue.count({ where: { runId: run.id, code: "VERIFY_SECONDARY_TARGET_MISSING" } })).toBe(1)
    } finally { await prisma.invoiceLine.create({ data: sibling }) }
    await expect(verifyMigrationRun(run.id)).resolves.toMatchObject({ success: true })
  })

  it("does not reset a verified import by simulating it again", async () => {
    await prisma.migrationRun.update({ where: { id: runId }, data: { status: "VERIFIED" } })
    await expect(simulateMigrationRun(runId)).rejects.toThrow(/finalisé/)
    expect((await prisma.migrationRun.findUniqueOrThrow({ where: { id: runId } })).status).toBe("VERIFIED")
  })

  it("does not overwrite a concurrently claimed run or its previous diagnostics", async () => {
    await prisma.migrationRun.update({ where: { id: runId }, data: { status: "IMPORTED" } })
    const diagnostic = await prisma.migrationIssue.create({ data: {
      runId, severity: "WARNING", code: "VERIFY_PREVIOUS_RESULT", message: "Synthetic previous diagnostic",
    } })
    // Change the run after its initial read, while mappings are being checked.
    const mappingRead = vi.spyOn(prisma.externalIdMap, "findMany").mockImplementationOnce(() =>
      prisma.migrationRun.update({ where: { id: runId }, data: { status: "IMPORTING" } }).then(() => []) as never
    )
    try {
      await expect(verifyMigrationRun(runId)).rejects.toThrow(/changé pendant la vérification/)
      expect((await prisma.migrationRun.findUniqueOrThrow({ where: { id: runId } })).status).toBe("IMPORTING")
      expect(await prisma.migrationIssue.findUnique({ where: { id: diagnostic.id } })).not.toBeNull()
      expect(await prisma.migrationIssue.count({ where: { runId, code: "VERIFY_EXTERNAL_ID_MAP_MISSING" } })).toBe(0)
    } finally {
      mappingRead.mockRestore()
      await prisma.migrationIssue.delete({ where: { id: diagnostic.id } })
      await prisma.migrationRun.update({ where: { id: runId }, data: { status: "IMPORTED" } })
    }
    await expect(verifyMigrationRun(runId)).resolves.toMatchObject({ success: true })
  })

  it("does not reset a verified import by analyzing an attached archive", async () => {
    await prisma.migrationRun.update({ where: { id: runId }, data: { status: "VERIFIED" } })
    const document = await prisma.documentManifest.create({ data: {
      companyId: identity.companyId, runId, provider: "EXTRABAT", sourceDocumentId: `manual:${runId}:test`,
      fileName: "contacts.csv", size: 1, sha256: "0".repeat(64), storageKey: "local:missing-test-archive",
    } })
    try {
      await expect(analyzeMigrationRun(runId)).rejects.toThrow(/finalisé/)
      expect((await prisma.migrationRun.findUniqueOrThrow({ where: { id: runId } })).status).toBe("VERIFIED")
    } finally {
      await prisma.documentManifest.delete({ where: { id: document.id } })
    }
  })

  it("blocks direct import and final verification while source errors remain unresolved", async () => {
    await prisma.migrationRun.update({ where: { id: runId }, data: { status: "PARTIAL" } })
    const issue = await prisma.migrationIssue.create({ data: {
      runId, severity: "ERROR", code: "INGEST_ROW_LIMIT", message: "Archive partielle : lignes non extraites", status: "OPEN",
    } })
    try {
      await expect(importMigrationRun(runId)).rejects.toThrow(/bloquant/)
      expect((await prisma.migrationRun.findUniqueOrThrow({ where: { id: runId } })).status).toBe("PARTIAL")
      await expect(verifyMigrationRun(runId)).resolves.toMatchObject({ success: false, status: "VERIFICATION_FAILED" })
      expect(await prisma.migrationIssue.count({ where: { runId, code: "VERIFY_UNRESOLVED_SOURCE_ERRORS" } })).toBe(1)
    } finally {
      await prisma.migrationIssue.delete({ where: { id: issue.id } })
    }
    // A previous verification diagnostic must not permanently block recovery.
    await expect(verifyMigrationRun(runId)).resolves.toMatchObject({ success: true, status: "VERIFIED", blocking: 0 })
  })

  it("does not import when another process has already claimed the run", async () => {
    await prisma.migrationRun.update({ where: { id: runId }, data: { status: "IMPORTED" } })
    const claim = vi.spyOn(prisma.migrationRun, "updateMany").mockResolvedValueOnce({ count: 0 })
    try {
      await expect(importMigrationRun(runId)).rejects.toThrow(/changé/)
    } finally {
      claim.mockRestore()
    }
    expect((await prisma.migrationRun.findUniqueOrThrow({ where: { id: runId } })).status).toBe("IMPORTED")
  })

  it("does not verify a reconciled run that still has rejected source rows", async () => {
    await prisma.migrationRun.update({ where: { id: runId }, data: { status: "PARTIAL" } })
    const record = await prisma.sourceRecord.create({ data: {
      companyId: identity.companyId, runId, provider: "EXTRABAT", objectType: "unsupported", sourceId: "unhandled-1", payload: {}, checksum: "sha256-unhandled-1",
    } })
    const metric = await prisma.migrationMetric.create({ data: { runId, objectType: "unsupported", sourceCount: 1, extracted: 1, rejected: 1 } })
    try {
      await expect(verifyMigrationRun(runId)).resolves.toMatchObject({ success: false, status: "VERIFICATION_FAILED", rejected: 1 })
      expect(await prisma.migrationIssue.count({ where: { runId, code: "VERIFY_REJECTED_RECORDS" } })).toBe(1)
    } finally {
      await prisma.migrationMetric.delete({ where: { id: metric.id } })
      await prisma.sourceRecord.delete({ where: { id: record.id } })
    }
  })
})
