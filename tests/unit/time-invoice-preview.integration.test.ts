import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/finance/issued-invoice", () => ({ prepareIssuedInvoice: vi.fn(), discardIssuedInvoice: vi.fn() }))
import prisma from "@/lib/prisma"
import { createInvoiceFromTimeEntries, getUnbilledTimeEntries } from "@/actions/factures"
import { updateTimeEntry } from "@/actions/temps"
import { buildTimeInvoiceLines } from "@/lib/finance/time-invoice-lines"
import { calculateCommercialDocument } from "@/lib/finance/commercial-calculation"
import { revalidatePath } from "next/cache"

const refusal = { ok: false, error: "Les temps ont changé pendant la création de la facture. Rechargez la page puis réessayez." }
describe.sequential("Time invoices verify the displayed preview before preparation in SQL", () => {
  let clientId: string, otherClientId: string, projectId: string, otherProjectId: string, membershipId: string, userId: string, otherUserId: string, agencyId: string
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional displayed time invoice", isTvaApplicable: false } })).id
    userId = session.userId = (await prisma.user.create({ data: { email: `time-preview-${randomUUID()}@example.test` } })).id
    membershipId = (await prisma.membership.create({ data: { companyId: session.companyId, userId, role: "OWNER", status: "ACTIVE" } })).id
    otherUserId = (await prisma.user.create({ data: { email: `time-preview-other-${randomUUID()}@example.test` } })).id
    await prisma.membership.create({ data: { companyId: session.companyId, userId: otherUserId, role: "OWNER", status: "ACTIVE" } })
    agencyId = (await prisma.agency.create({ data: { companyId: session.companyId, code: "PREVIEW", name: "Fictional preview agency" } })).id
    clientId = (await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional displayed customer" } })).id
    otherClientId = (await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional alternative customer" } })).id
    projectId = (await prisma.project.create({ data: { companyId: session.companyId, clientId, agencyId, name: "Fictional displayed project" } })).id
    otherProjectId = (await prisma.project.create({ data: { companyId: session.companyId, clientId, agencyId, name: "Fictional alternative project" } })).id
  })
  afterEach(async () => {
    session.userId = userId; vi.restoreAllMocks(); vi.clearAllMocks()
    await prisma.timeEntry.deleteMany({ where: { project: { companyId: session.companyId } } })
    await prisma.invoice.deleteMany({ where: { companyId: session.companyId } })
    await prisma.auditLog.deleteMany({ where: { userId: { in: [userId, otherUserId] } } })
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OWNER" } })
    await prisma.company.update({ where: { id: session.companyId }, data: { isTvaApplicable: false, invoicePrefix: "FACT-" } })
    await prisma.project.update({ where: { id: projectId }, data: { clientId, agencyId, name: "Fictional displayed project", consumedCents: 0 } })
    await prisma.client.update({ where: { id: clientId }, data: { name: "Fictional displayed customer" } })
  })
  afterAll(async () => {
    await prisma.project.deleteMany({ where: { companyId: session.companyId } }); await prisma.client.deleteMany({ where: { companyId: session.companyId } })
    await prisma.company.delete({ where: { id: session.companyId } }); await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } })
  })
  const row = () => prisma.timeEntry.create({ data: { projectId, durationSec: 3600, date: new Date("2030-01-01"), description: "Fictional displayed description" } })
  async function displayed(...ids: string[]) {
    const data = await getUnbilledTimeEntries()
    return { timeEntryIds: ids, timeEntryVersions: data.entries.filter(entry => ids.includes(entry.id)).map(({ id, version }) => ({ id, version })), hourlyRateCents: 10000, dueDate: "2030-02-01", lineMode: "DETAIL" as const }
  }
  async function noInvoice() {
    expect(await prisma.invoice.count({ where: { companyId: session.companyId } })).toBe(0)
    expect(await prisma.invoiceLine.count({ where: { invoice: { companyId: session.companyId } } })).toBe(0)
    expect(await prisma.auditLog.count({ where: { userId: { in: [userId, otherUserId] }, action: "CREATE_INVOICE_FROM_TIME" } })).toBe(0)
    expect(revalidatePath).not.toHaveBeenCalled()
  }
  it.each(["duration", "date", "description", "billability"])("refuses a %s edit completed before submission and keeps the legitimate edit", async kind => {
    const entry = await row(), data = await displayed(entry.id)
    const patch = kind === "duration" ? { durationSec: 7200 } : kind === "date" ? { date: new Date("2030-01-02") } : kind === "description" ? { description: "Fictional edited description" } : { isBillable: false }
    expect(await updateTimeEntry(entry.id, patch)).toMatchObject({ ok: true })
    vi.mocked(revalidatePath).mockClear()
    expect(await createInvoiceFromTimeEntries(data)).toEqual(refusal)
    expect(await prisma.timeEntry.findUniqueOrThrow({ where: { id: entry.id } })).toEqual({ ...entry, ...patch })
    await noInvoice()
  })
  it.each(["VAT", "prefix", "project", "client", "project name", "client name", "agency"])("refuses a %s change completed before submission", async kind => {
    const entry = await row(), data = await displayed(entry.id)
    if (kind === "VAT" || kind === "prefix") await prisma.company.update({ where: { id: session.companyId }, data: kind === "VAT" ? { isTvaApplicable: true } : { invoicePrefix: "NEW-" } })
    else if (kind === "project") await prisma.timeEntry.update({ where: { id: entry.id }, data: { projectId: otherProjectId } })
    else if (kind === "client") await prisma.project.update({ where: { id: projectId }, data: { clientId: otherClientId } })
    else if (kind === "project name") await prisma.project.update({ where: { id: projectId }, data: { name: "Fictional edited project" } })
    else if (kind === "agency") await prisma.project.update({ where: { id: projectId }, data: { agencyId: null } })
    else await prisma.client.update({ where: { id: clientId }, data: { name: "Fictional edited customer" } })
    const current = await prisma.timeEntry.findUniqueOrThrow({ where: { id: entry.id }, include: { project: { include: { client: true } } } })
    expect(await createInvoiceFromTimeEntries(data)).toEqual(refusal)
    expect(await prisma.timeEntry.findUniqueOrThrow({ where: { id: entry.id }, include: { project: { include: { client: true } } } })).toEqual(current)
    await noInvoice()
  })
  it.each(["missing", "empty", "malformed", "forged", "different entry", "duplicate"])("refuses a %s version without a draft, claim or audit", async kind => {
    const entry = await row(), data = await displayed(entry.id)
    const payload = { ...data } as Record<string, unknown>
    if (kind === "missing") delete payload.timeEntryVersions
    else if (kind === "empty") payload.timeEntryVersions = []
    else if (kind === "malformed") payload.timeEntryVersions = [{ id: entry.id, version: {} }]
    else if (kind === "forged") payload.timeEntryVersions = [{ id: entry.id, version: "0".repeat(64) }]
    else if (kind === "different entry") payload.timeEntryVersions = [{ ...data.timeEntryVersions[0], id: "fictional-other-entry" }]
    else payload.timeEntryVersions = [data.timeEntryVersions[0], data.timeEntryVersions[0]]
    expect(await createInvoiceFromTimeEntries(payload as Parameters<typeof createInvoiceFromTimeEntries>[0])).toEqual(refusal)
    expect(await prisma.timeEntry.findUniqueOrThrow({ where: { id: entry.id } })).toEqual(entry)
    await noInvoice()
  })
  it("does not let another authorized user reuse the displayed version", async () => {
    const entry = await row(), data = await displayed(entry.id)
    session.userId = otherUserId
    expect(await createInvoiceFromTimeEntries(data)).toEqual(refusal); await noInvoice()
  })
  it("checks current rights before business reads even with a valid displayed version", async () => {
    const entry = await row(), data = await displayed(entry.id)
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "VIEWER" } })
    const read = vi.spyOn(prisma.timeEntry, "findMany")
    await expect(createInvoiceFromTimeEntries(data)).rejects.toThrow("droits nécessaires")
    expect(read).not.toHaveBeenCalled(); await noInvoice()
  })
  it("refuses an entry deleted after its preview was displayed", async () => {
    const entry = await row(), data = await displayed(entry.id)
    await prisma.timeEntry.delete({ where: { id: entry.id } })
    expect(await createInvoiceFromTimeEntries(data)).toEqual(refusal); await noInvoice()
  })
  it("uses a fresh displayed version after refusal, without silently accepting the old one", async () => {
    const entry = await row(), initial = await getUnbilledTimeEntries(), data = await displayed(entry.id)
    expect(calculateCommercialDocument(buildTimeInvoiceLines(initial.entries, 10000, 0, "DETAIL")).totalHtCents).toBe(10000)
    expect(await updateTimeEntry(entry.id, { durationSec: 7200 })).toMatchObject({ ok: true })
    vi.mocked(revalidatePath).mockClear()
    expect(await createInvoiceFromTimeEntries(data)).toEqual(refusal); await noInvoice()
    const current = await getUnbilledTimeEntries()
    expect(calculateCommercialDocument(buildTimeInvoiceLines(current.entries, 10000, 0, "DETAIL")).totalHtCents).toBe(20000)
    const result = await createInvoiceFromTimeEntries(await displayed(entry.id))
    if (!result.ok) throw new Error(result.error)
    expect(await prisma.invoice.findUniqueOrThrow({ where: { id: result.value.id } })).toMatchObject({ status: "DRAFT", totalHtCents: 20000 })
    expect((await prisma.timeEntry.findUniqueOrThrow({ where: { id: entry.id } })).invoiceId).toBe(result.value.id)
    expect(await prisma.auditLog.count({ where: { resourceId: result.value.id, action: "CREATE_INVOICE_FROM_TIME" } })).toBe(1)
  })
})
