import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

const identity = vi.hoisted(() => ({
  companyId: "",
  userId: "",
}))

vi.mock("@/auth", () => ({ auth: vi.fn(async () => ({ user: { id: identity.userId }, companyId: identity.companyId })) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("server-only", () => ({}))

import { importMigrationRun, simulateMigrationRun, verifyMigrationRun } from "@/actions/migrations"
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
})
