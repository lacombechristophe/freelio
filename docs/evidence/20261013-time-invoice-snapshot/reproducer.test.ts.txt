import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
const fault = vi.hoisted(() => ({ stage: "", reads: 0, gate: null as { wait: Promise<void>; release: () => void } | null }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/finance/issued-invoice", () => ({ prepareIssuedInvoice: vi.fn(), discardIssuedInvoice: vi.fn() }))
vi.mock("@/lib/prisma", async importOriginal => {
  const prismaModule = await importOriginal<typeof import("@/lib/prisma")>()
  const real = prismaModule.default, transaction = real.$transaction.bind(real)
  return { ...prismaModule, default: new Proxy(real, { get(target, key) {
    if (key !== "$transaction") return Reflect.get(target, key)
    return (callback: Parameters<typeof transaction>[0], options?: Parameters<typeof transaction>[1]) => transaction(tx => callback(new Proxy(tx, { get(client, delegate) {
      if (!["invoice", "timeEntry", "auditLog"].includes(String(delegate))) return Reflect.get(client, delegate)
      const model = Reflect.get(client, delegate)
      return new Proxy(model, { get(object, operation) {
        if ((delegate === "invoice" && operation === "create" && fault.stage === "invoice") || (delegate === "timeEntry" && operation === "updateMany" && ["claim", "serialization"].includes(fault.stage)) || (delegate === "auditLog" && operation === "create" && fault.stage === "audit")) return () => {
          if (fault.stage === "serialization") throw new Prisma.PrismaClientKnownRequestError("Fictional rolled-back conflict", { code: "P2034", clientVersion: "6.12.0" })
          throw new Error(`Fictional ${fault.stage} outage`)
        }
        if (delegate === "timeEntry" && operation === "findMany") return async (...args: unknown[]) => {
          const result = await Reflect.apply(Reflect.get(object, operation), object, args)
          if (fault.gate && fault.reads < 2) {
            if (++fault.reads === 2) fault.gate.release()
            await fault.gate.wait
          }
          return result
        }
        return Reflect.get(object, operation)
      } })
    } })), options)
  } }) }
})
import { Prisma } from "@prisma/client"
import prisma from "@/lib/prisma"
import { createInvoiceFromTimeEntries } from "@/actions/factures"
import { updateTimeEntry } from "@/actions/temps"
import { revalidatePath } from "next/cache"
import { getContext } from "@/lib/context"

const refusal = { ok: false, error: "Les temps ont changé pendant la création de la facture. Rechargez la page puis réessayez." }
describe.sequential("Time invoices refuse a stale prepared snapshot in SQL", () => {
  let clientId: string, otherClientId: string, projectId: string, otherProjectId: string
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional prepared time invoice", isTvaApplicable: false, invoicePrefix: "PREP-" } })).id
    session.userId = (await prisma.user.create({ data: { email: `time-snapshot-${randomUUID()}@example.test` } })).id
    await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })
    clientId = (await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional prepared customer" } })).id
    otherClientId = (await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional different customer" } })).id
    projectId = (await prisma.project.create({ data: { companyId: session.companyId, clientId, name: "Fictional prepared project" } })).id
    otherProjectId = (await prisma.project.create({ data: { companyId: session.companyId, clientId, name: "Fictional different project" } })).id
  })
  afterEach(async () => {
    fault.stage = ""; fault.reads = 0; fault.gate = null; vi.restoreAllMocks(); vi.clearAllMocks()
    await prisma.timeEntry.deleteMany({ where: { projectId: { in: [projectId, otherProjectId] } } }); await prisma.invoice.deleteMany({ where: { companyId: session.companyId } })
    await prisma.auditLog.deleteMany({ where: { userId: session.userId } })
    await prisma.company.update({ where: { id: session.companyId }, data: { isTvaApplicable: false, invoicePrefix: "PREP-" } })
    await prisma.project.update({ where: { id: projectId }, data: { clientId, name: "Fictional prepared project", consumedCents: 0 } })
    await prisma.client.update({ where: { id: clientId }, data: { name: "Fictional prepared customer" } })
  })
  afterAll(async () => {
    await prisma.project.deleteMany({ where: { companyId: session.companyId } }); await prisma.client.deleteMany({ where: { companyId: session.companyId } })
    await prisma.company.delete({ where: { id: session.companyId } }); await prisma.user.delete({ where: { id: session.userId } })
  })
  const row = () => prisma.timeEntry.create({ data: { projectId, durationSec: 3600, date: new Date("2030-01-01"), description: "Fictional prepared description" } })
  const input = (...ids: string[]) => ({ timeEntryIds: ids, hourlyRateCents: 10000, dueDate: "2030-02-01", lineMode: "DETAIL" as const })
  function afterPreflight(change: () => Promise<unknown>) {
    const read = prisma.timeEntry.findMany.bind(prisma.timeEntry)
    vi.spyOn(prisma.timeEntry, "findMany").mockImplementationOnce((async args => { const entries = await read(args); await change(); vi.mocked(revalidatePath).mockClear(); return entries }) as typeof prisma.timeEntry.findMany)
  }
  async function noInvoice() {
    expect(await prisma.invoice.count({ where: { companyId: session.companyId } })).toBe(0)
    expect(await prisma.invoiceLine.count({ where: { invoice: { companyId: session.companyId } } })).toBe(0)
    expect(await prisma.auditLog.count({ where: { userId: session.userId, action: "CREATE_INVOICE_FROM_TIME" } })).toBe(0)
    expect(revalidatePath).not.toHaveBeenCalled(); expect(getContext()).toBeUndefined()
  }
  it.each(["duration", "date", "description", "billability"])("preserves a legitimate %s edit and refuses the previous calculation", async kind => {
    const entry = await row()
    const patch = kind === "duration" ? { durationSec: 7200 } : kind === "date" ? { date: new Date("2030-01-02") } : kind === "description" ? { description: "Fictional current description" } : { isBillable: false }
    afterPreflight(async () => { expect(await updateTimeEntry(entry.id, patch)).toMatchObject({ ok: true }) })
    expect(await createInvoiceFromTimeEntries(input(entry.id))).toEqual(refusal)
    expect(await prisma.timeEntry.findUniqueOrThrow({ where: { id: entry.id } })).toEqual({ ...entry, ...patch })
    await noInvoice()
  })
  it.each(["VAT", "prefix", "project", "client", "project name", "client name"])("refuses stale %s data without undoing the external edit", async kind => {
    const entry = await row()
    afterPreflight(async () => {
      if (kind === "VAT" || kind === "prefix") await prisma.company.update({ where: { id: session.companyId }, data: kind === "VAT" ? { isTvaApplicable: true } : { invoicePrefix: "CURRENT-" } })
      else if (kind === "project") await prisma.timeEntry.update({ where: { id: entry.id }, data: { projectId: otherProjectId } })
      else if (kind === "client") await prisma.project.update({ where: { id: projectId }, data: { clientId: otherClientId } })
      else if (kind === "project name") await prisma.project.update({ where: { id: projectId }, data: { name: "Fictional current project" } })
      else await prisma.client.update({ where: { id: clientId }, data: { name: "Fictional current customer" } })
    })
    expect(await createInvoiceFromTimeEntries(input(entry.id))).toEqual(refusal)
    expect(await prisma.timeEntry.findUniqueOrThrow({ where: { id: entry.id } })).toEqual({ ...entry, projectId: kind === "project" ? otherProjectId : projectId })
    if (kind === "VAT" || kind === "prefix") expect(await prisma.company.findUniqueOrThrow({ where: { id: session.companyId } })).toMatchObject(kind === "VAT" ? { isTvaApplicable: true } : { invoicePrefix: "CURRENT-" })
    if (kind === "client") expect(await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).toMatchObject({ clientId: otherClientId })
    if (kind === "project name") expect(await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).toMatchObject({ name: "Fictional current project" })
    if (kind === "client name") expect(await prisma.client.findUniqueOrThrow({ where: { id: clientId } })).toMatchObject({ name: "Fictional current customer" })
    await noInvoice()
  })
  it("refuses a selection deleted after preparation", async () => {
    const entry = await row(); afterPreflight(() => prisma.timeEntry.delete({ where: { id: entry.id } }))
    expect(await createInvoiceFromTimeEntries(input(entry.id))).toEqual(refusal); await noInvoice()
  })
  it.each(["invoice", "claim", "audit"])("rolls back every effect after a %s outage", async stage => {
    const entry = await row(); fault.stage = stage
    await expect(createInvoiceFromTimeEntries(input(entry.id))).rejects.toThrow(`Fictional ${stage} outage`)
    expect(await prisma.timeEntry.findUniqueOrThrow({ where: { id: entry.id } })).toEqual(entry); await noInvoice()
  })
  it("returns the controlled refusal after a rolled-back serialization conflict", async () => {
    const entry = await row(); fault.stage = "serialization"
    expect(await createInvoiceFromTimeEntries(input(entry.id))).toEqual(refusal)
    expect(await prisma.timeEntry.findUniqueOrThrow({ where: { id: entry.id } })).toEqual(entry); await noInvoice()
  })
  it("allows a new preparation to use the current duration", async () => {
    const entry = await row(); afterPreflight(async () => { expect(await updateTimeEntry(entry.id, { durationSec: 7200 })).toMatchObject({ ok: true }) })
    expect(await createInvoiceFromTimeEntries(input(entry.id))).toEqual(refusal)
    const result = await createInvoiceFromTimeEntries(input(entry.id))
    expect(result).toMatchObject({ ok: true })
    if (!result.ok) throw new Error(result.error)
    expect(await prisma.invoice.findUniqueOrThrow({ where: { id: result.value.id } })).toMatchObject({ status: "DRAFT", totalHtCents: 20000 })
  })
  it("keeps one winning invoice for two requests, with a real PostgreSQL read barrier", async () => {
    const entry = await row()
    if (process.env.DATABASE_URL?.startsWith("postgres")) {
      let release!: () => void
      fault.gate = { wait: new Promise<void>(resolve => { release = resolve }), release: () => release() }
      const results = await Promise.all([createInvoiceFromTimeEntries(input(entry.id)), createInvoiceFromTimeEntries(input(entry.id))])
      expect(fault.reads).toBe(2)
      expect(results.filter(result => result.ok)).toHaveLength(1)
      expect(results.filter(result => !result.ok)).toEqual([refusal])
    } else {
      expect(await createInvoiceFromTimeEntries(input(entry.id))).toMatchObject({ ok: true })
      await expect(createInvoiceFromTimeEntries(input(entry.id))).rejects.toThrow("Certaines entrées sont introuvables")
    }
    expect(await prisma.invoice.count({ where: { companyId: session.companyId } })).toBe(1)
    expect(await prisma.auditLog.count({ where: { userId: session.userId, action: "CREATE_INVOICE_FROM_TIME" } })).toBe(1)
    expect((await prisma.timeEntry.findUniqueOrThrow({ where: { id: entry.id } })).invoiceId).not.toBeNull()
  })
})
