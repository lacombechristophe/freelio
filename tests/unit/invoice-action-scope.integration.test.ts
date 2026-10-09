import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
// SQL and authorization remain real. This suite checks archive invocation,
// not PDF rendering, storage or Factur-X conformance.
vi.mock("@/lib/finance/issued-invoice", () => ({
  prepareIssuedInvoice: vi.fn(async () => ({ issuedDocument: "fictional-snapshot", pdfUrl: "fictional-archive", pdfHash: "fictional-hash" })),
  discardIssuedInvoice: vi.fn(),
}))
import prisma from "@/lib/prisma"
import { createCreditNote, createInvoice, createInvoiceFromTimeEntries, deleteInvoice, getInvoices, getUnbilledTimeEntries, prepareInvoiceReminder, recordPayment, updateInvoice, updateInvoiceStatus } from "@/actions/factures"
import { prepareIssuedInvoice } from "@/lib/finance/issued-invoice"

describe.sequential("invoice actions enforce financial rights and client scope on SQL", () => {
  let membershipId: string, foreignCompanyId: string, clientId: string, foreignClientId: string, projectId: string, invalidProjectId: string
  const amounts = { totalHtCents: 10000, totalTvaCents: 0, totalTtcCents: 10000 }
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional invoice action company" } })).id
    foreignCompanyId = (await prisma.company.create({ data: { name: "Fictional foreign invoice company" } })).id
    session.userId = (await prisma.user.create({ data: { email: `invoice-actions-${randomUUID()}@example.test` } })).id
    membershipId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    clientId = (await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional invoice customer" } })).id
    foreignClientId = (await prisma.client.create({ data: { companyId: foreignCompanyId, name: "Fictional foreign invoice customer" } })).id
    const agency = await prisma.agency.create({ data: { companyId: session.companyId, code: "INVOICE", name: "Fictional invoice agency" } })
    await prisma.agencyMembership.create({ data: { agencyId: agency.id, membershipId } })
    projectId = (await prisma.project.create({ data: { companyId: session.companyId, clientId, agencyId: agency.id, name: "Fictional invoice project" } })).id
    invalidProjectId = (await prisma.project.create({ data: { companyId: session.companyId, clientId: foreignClientId, name: "Fictional inconsistent invoice project" } })).id
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OWNER" } })
    const invoiceScope = { invoice: { companyId: { in: [session.companyId, foreignCompanyId] } } }
    await prisma.invoicePayment.deleteMany({ where: invoiceScope })
    await prisma.creditNote.deleteMany({ where: invoiceScope })
    await prisma.invoice.deleteMany({ where: { companyId: { in: [session.companyId, foreignCompanyId] } } })
    await prisma.timeEntry.deleteMany({ where: { projectId: { in: [projectId, invalidProjectId] } } })
    await prisma.auditLog.deleteMany({ where: { userId: session.userId } })
  })
  afterAll(async () => {
    await prisma.project.deleteMany({ where: { companyId: session.companyId } })
    await prisma.client.deleteMany({ where: { companyId: { in: [session.companyId, foreignCompanyId] } } })
    await prisma.company.deleteMany({ where: { id: { in: [session.companyId, foreignCompanyId] } } })
    await prisma.user.delete({ where: { id: session.userId } })
  })
  async function invoice(client = clientId, status = "SENT") {
    return prisma.invoice.create({ data: { companyId: session.companyId, clientId: client, projectId: client === clientId ? projectId : invalidProjectId, number: randomUUID(), object: "Fictional invoice", status, dueDate: new Date("2030-01-01"), ...amounts } })
  }
  async function role(value: string) {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: value } })
  }
  function invoiceInput() {
    return { clientId, projectId, object: "Fictional invoice", dueDate: "2030-01-01", lines: [{ label: "Fictional service", quantity: 1, unitPriceCents: 10000, tvaRate: 0 }] }
  }
  it("excludes an invoice attached to another company's client from the list", async () => {
    const coherent = await invoice(), invalid = await invoice(foreignClientId)
    expect((await getInvoices()).map(item => item.id)).toEqual([coherent.id])
    expect((await getInvoices()).map(item => item.id)).not.toContain(invalid.id)
  })
  it("excludes unbilled times attached to another company's client", async () => {
    const valid = await prisma.timeEntry.create({ data: { projectId, durationSec: 3600, isBillable: true } })
    await prisma.timeEntry.create({ data: { projectId: invalidProjectId, durationSec: 7200, isBillable: true } })
    expect(await getUnbilledTimeEntries()).toMatchObject({ totalDurationSec: 3600, entries: [{ id: valid.id }] })
  })
  it.each(["SALES", "OPERATIONS", "TECHNICIAN", "SERVICE"])("rejects unbilled-time reads before querying financial data for %s", async value => {
    await role(value)
    const read = vi.spyOn(prisma.timeEntry, "findMany")
    await expect(getUnbilledTimeEntries()).rejects.toThrow("droits nécessaires")
    expect(read).not.toHaveBeenCalled()
  })
  it.each(["SALES", "OPERATIONS", "TECHNICIAN", "SERVICE", "VIEWER"])("rejects payment writes before reading the invoice for %s", async value => {
    const existing = await invoice()
    await role(value)
    const read = vi.spyOn(prisma.invoice, "findFirst")
    await expect(recordPayment({ invoiceId: existing.id, amountCents: 100, method: "CASH" })).rejects.toThrow("droits nécessaires")
    expect(read).not.toHaveBeenCalled()
  })
  const inconsistentActions = [
    ["issue", "DRAFT", (id: string) => updateInvoiceStatus(id, "SENT")],
    ["payment", "SENT", (id: string) => recordPayment({ invoiceId: id, amountCents: 100, method: "CASH" })],
    ["credit", "SENT", (id: string) => createCreditNote({ invoiceId: id, amountCents: 100, reason: "Fictional correction" })],
    ["reminder", "SENT", (id: string) => prepareInvoiceReminder({ invoiceId: id })],
    ["delete", "DRAFT", (id: string) => deleteInvoice(id)],
  ] as const
  it.each(inconsistentActions)("refuses %s on an invoice with a foreign client without side effects", async (_label, status, action) => {
    const existing = await invoice(foreignClientId, status)
    await expect(action(existing.id)).rejects.toThrow("Facture introuvable")
    expect(await prisma.invoice.findUniqueOrThrow({ where: { id: existing.id } })).toMatchObject({ status, paidAmountCents: 0 })
    expect(await prisma.invoicePayment.count({ where: { invoiceId: existing.id } })).toBe(0)
    expect(await prisma.invoiceReminder.count({ where: { invoiceId: existing.id } })).toBe(0)
    expect(await prisma.creditNote.count({ where: { invoiceId: existing.id } })).toBe(0)
    expect(await prisma.invoice.count({ where: { originalInvoiceId: existing.id } })).toBe(0)
    expect(prepareIssuedInvoice).not.toHaveBeenCalled()
  })
  it("refuses updating an inconsistent draft without replacing its client", async () => {
    const existing = await invoice(foreignClientId, "DRAFT")
    await expect(updateInvoice(existing.id, invoiceInput())).rejects.toThrow("Facture introuvable")
    expect(await prisma.invoice.findUniqueOrThrow({ where: { id: existing.id } })).toMatchObject({ clientId: foreignClientId, updatedAt: existing.updatedAt })
  })
  it("refuses invoicing times linked to a foreign client without consuming them", async () => {
    const entry = await prisma.timeEntry.create({ data: { projectId: invalidProjectId, durationSec: 3600, isBillable: true } })
    await expect(createInvoiceFromTimeEntries({ timeEntryIds: [entry.id], hourlyRateCents: 10000, dueDate: "2030-01-01" })).rejects.toThrow("Certaines entr")
    expect(await prisma.timeEntry.findUniqueOrThrow({ where: { id: entry.id } })).toMatchObject({ invoiceId: null })
    expect(await prisma.invoice.count({ where: { companyId: session.companyId } })).toBe(0)
  })
  it.each(["credit", "reminder", "delete", "update", "create", "time"])("rejects %s before invoice or time reads for Viewer", async action => {
    const existing = await invoice(clientId, "DRAFT")
    await role("VIEWER")
    const read = vi.spyOn(prisma.invoice, "findFirst"), timeRead = vi.spyOn(prisma.timeEntry, "findMany")
    const actions = {
      credit: () => createCreditNote({ invoiceId: existing.id, amountCents: 100, reason: "Fictional correction" }),
      reminder: () => prepareInvoiceReminder({ invoiceId: existing.id }),
      delete: () => deleteInvoice(existing.id),
      update: () => updateInvoice(existing.id, invoiceInput()),
      create: () => createInvoice(invoiceInput()),
      time: () => createInvoiceFromTimeEntries({ timeEntryIds: ["fictional-entry"], hourlyRateCents: 10000, dueDate: "2030-01-01" }),
    }
    await expect(actions[action as keyof typeof actions]()).rejects.toThrow("droits nécessaires")
    expect(read).not.toHaveBeenCalled()
    expect(timeRead).not.toHaveBeenCalled()
  })
  it("does not subtract a foreign credit from the available local credit amount", async () => {
    const original = await invoice()
    await prisma.invoice.create({ data: { companyId: foreignCompanyId, clientId: foreignClientId, originalInvoiceId: original.id, number: randomUUID(), object: "Fictional foreign credit", type: "CREDIT_NOTE", status: "SENT", dueDate: new Date("2030-01-01"), totalHtCents: -10000, totalTvaCents: 0, totalTtcCents: -10000 } })
    const credit = await createCreditNote({ invoiceId: original.id, amountCents: 10000, reason: "Fictional complete correction" })
    expect(credit).toMatchObject({ companyId: session.companyId, clientId, originalInvoiceId: original.id, totalTtcCents: -10000 })
    expect(await prisma.creditNote.count({ where: { invoiceId: original.id } })).toBe(1)
    expect(prepareIssuedInvoice).toHaveBeenCalledOnce()
  })
  it("still subtracts coherent credits and refuses over-crediting", async () => {
    const original = await invoice()
    await createCreditNote({ invoiceId: original.id, amountCents: 6000, reason: "Fictional partial correction" })
    await expect(createCreditNote({ invoiceId: original.id, amountCents: 4001, reason: "Fictional excessive correction" })).rejects.toThrow("montant encore disponible")
    expect(await prisma.invoice.count({ where: { originalInvoiceId: original.id } })).toBe(1)
  })
  it("does not subtract a local credit attached to a different client", async () => {
    const original = await invoice()
    const other = await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional different credit client" } })
    await prisma.invoice.create({ data: { companyId: session.companyId, clientId: other.id, originalInvoiceId: original.id, number: randomUUID(), object: "Fictional mismatched credit", type: "CREDIT_NOTE", dueDate: new Date("2030-01-01"), totalHtCents: -10000, totalTvaCents: 0, totalTtcCents: -10000 } })
    expect(await createCreditNote({ invoiceId: original.id, amountCents: 10000, reason: "Fictional complete correction" })).toMatchObject({ clientId, totalTtcCents: -10000 })
  })
  it("keeps financial reads available to Viewer", async () => {
    const existing = await invoice()
    await role("VIEWER")
    expect((await getInvoices()).map(item => item.id)).toEqual([existing.id])
    expect(await getUnbilledTimeEntries()).toMatchObject({ totalDurationSec: 0 })
  })
  it("blocks payment before invoice reads in the public demo", async () => {
    const existing = await invoice()
    const read = vi.spyOn(prisma.invoice, "findFirst")
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    await expect(recordPayment({ invoiceId: existing.id, amountCents: 100, method: "CASH" })).rejects.toThrow("lecture seule")
    expect(read).not.toHaveBeenCalled()
  })
  it.each(["OWNER", "ADMIN", "ACCOUNTING"])("preserves coherent payments for %s", async value => {
    const existing = await invoice()
    await role(value)
    expect(await recordPayment({ invoiceId: existing.id, amountCents: 10000, method: "CASH" })).toMatchObject({ invoiceId: existing.id, amountCents: 10000 })
    expect(await prisma.invoice.findUniqueOrThrow({ where: { id: existing.id } })).toMatchObject({ status: "PAID", paidAmountCents: 10000 })
  })
  it("preserves invoice issuing for Owner", async () => {
    const existing = await invoice(clientId, "DRAFT")
    expect(await updateInvoiceStatus(existing.id, "SENT")).toMatchObject({ status: "SENT", issuedDocument: "fictional-snapshot" })
    expect(prepareIssuedInvoice).toHaveBeenCalledOnce()
  })
  it("preserves reminder preparation for Accounting", async () => {
    const existing = await invoice()
    await role("ACCOUNTING")
    expect(await prepareInvoiceReminder({ invoiceId: existing.id })).toMatchObject({ invoiceId: existing.id, remainingCents: 10000 })
  })
})
