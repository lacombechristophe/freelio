import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/finance/issued-invoice", () => ({ prepareIssuedInvoice: vi.fn(), discardIssuedInvoice: vi.fn() }))
import prisma from "@/lib/prisma"
import { createInvoiceFromTimeEntries, getUnbilledTimeEntries } from "@/actions/factures"
import { buildTimeInvoiceLines } from "@/lib/finance/time-invoice-lines"
import { calculateCommercialDocument } from "@/lib/finance/commercial-calculation"

describe.sequential("Time invoices preserve exact seconds and preview totals in SQL", () => {
  let clientId: string, projectId: string
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional exact time billing", isTvaApplicable: false } })).id
    session.userId = (await prisma.user.create({ data: { email: `exact-time-${randomUUID()}@example.test` } })).id
    await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })
    clientId = (await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional exact time customer" } })).id
    projectId = (await prisma.project.create({ data: { companyId: session.companyId, clientId, name: "Fictional exact time project" } })).id
  })
  afterEach(async () => {
    await prisma.timeEntry.deleteMany({ where: { projectId } }); await prisma.invoice.deleteMany({ where: { companyId: session.companyId } })
    await prisma.auditLog.deleteMany({ where: { userId: session.userId } })
    await prisma.company.update({ where: { id: session.companyId }, data: { isTvaApplicable: false } })
  })
  afterAll(async () => {
    await prisma.project.delete({ where: { id: projectId } }); await prisma.client.delete({ where: { id: clientId } })
    await prisma.company.delete({ where: { id: session.companyId } }); await prisma.user.delete({ where: { id: session.userId } })
  })
  const row = (durationSec: number) => prisma.timeEntry.create({ data: { projectId, durationSec, date: new Date("2030-01-01"), description: "Fictional exact time" } })
  const input = async (ids: string[], lineMode: "GROUP_BY_PROJECT" | "DETAIL" = "GROUP_BY_PROJECT") => ({ timeEntryIds: ids, timeEntryVersions: (await getUnbilledTimeEntries()).entries.filter(entry => ids.includes(entry.id)).map(({ id, version }) => ({ id, version })), hourlyRateCents: 10000, dueDate: "2030-02-01", lineMode })
  async function bill(data: Parameters<typeof createInvoiceFromTimeEntries>[0]) {
    const result = await createInvoiceFromTimeEntries(data)
    if (!result.ok) throw new Error(result.error)
    return prisma.invoice.findUniqueOrThrow({ where: { id: result.value.id } })
  }
  it.each([false, true])("matches both preview modes with VAT enabled = %s", async tax => {
    await prisma.company.update({ where: { id: session.companyId }, data: { isTvaApplicable: tax } })
    for (const mode of ["GROUP_BY_PROJECT", "DETAIL"] as const) {
      const rows = [await row(60), await row(60)]
      const preview = calculateCommercialDocument(buildTimeInvoiceLines(rows.map(entry => ({ ...entry, date: entry.date.toISOString(), project: { id: projectId, name: "Fictional exact time project" } })), 10000, tax ? 20 : 0, mode))
      const invoice = await bill(await input(rows.map(entry => entry.id), mode))
      expect(invoice).toMatchObject({ status: "DRAFT", totalHtCents: mode === "DETAIL" ? 334 : 333, totalTvaCents: tax ? mode === "DETAIL" ? 66 : 67 : 0, totalTtcCents: preview.totalTtcCents })
      const lines = await prisma.invoiceLine.findMany({ where: { invoiceId: invoice.id }, orderBy: { order: "asc" } })
      expect(lines).toHaveLength(mode === "DETAIL" ? 2 : 1)
      // SQLite's JSON transport can change the last binary-float digit.
      for (const line of lines) expect(line.quantity).toBeCloseTo(mode === "DETAIL" ? 1 / 60 : 1 / 30, 14)
      expect(calculateCommercialDocument(lines).totalHtCents).toBe(preview.totalHtCents)
      for (const entry of rows) expect(await prisma.timeEntry.findUniqueOrThrow({ where: { id: entry.id } })).toEqual({ ...entry, invoiceId: invoice.id })
    }
  })
  it("keeps a one-second time positive without first rounding its hours to zero", async () => {
    const entry = await row(1), invoice = await bill(await input([entry.id], "DETAIL"))
    expect(invoice.totalHtCents).toBe(3)
    expect(await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: invoice.id } })).toMatchObject({ quantity: 1 / 3600 })
  })
  it("preserves an existing invoice while creating a new exact-time draft", async () => {
    const history = await prisma.invoice.create({ data: { companyId: session.companyId, clientId, projectId, number: "FICTIONAL-HISTORICAL-ROUNDING", object: "Fictional existing invoice", dueDate: new Date("2030-02-01"), totalHtCents: 300, totalTvaCents: 0, totalTtcCents: 300, lines: { create: { label: "Fictional old rounding", quantity: 0.03, unitPriceCents: 10000, tvaRate: 0 } } }, include: { lines: true } })
    const entry = await row(60); await createInvoiceFromTimeEntries(await input([entry.id]))
    expect(await prisma.invoice.findUniqueOrThrow({ where: { id: history.id }, include: { lines: true } })).toEqual(history)
  })
  it("refuses an out-of-capacity amount before creating a draft or association", async () => {
    const entry = await row(7200)
    await expect(createInvoiceFromTimeEntries({ ...await input([entry.id]), hourlyRateCents: 2_000_000_000 })).rejects.toThrow(RangeError)
    expect(await prisma.invoice.count({ where: { companyId: session.companyId } })).toBe(0)
    expect(await prisma.timeEntry.findUniqueOrThrow({ where: { id: entry.id } })).toEqual(entry)
    expect(await prisma.auditLog.count({ where: { userId: session.userId } })).toBe(0)
  })
})
