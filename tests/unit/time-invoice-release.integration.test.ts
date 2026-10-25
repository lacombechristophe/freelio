import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
const fault = vi.hoisted(() => ({ stage: "", transactions: 0, target: "", read: null as (() => void) | null, wait: null as Promise<void> | null }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/finance/issued-invoice", () => ({ prepareIssuedInvoice: vi.fn(), discardIssuedInvoice: vi.fn() }))
vi.mock("@/lib/prisma", async importOriginal => {
  const prismaModule = await importOriginal<typeof import("@/lib/prisma")>()
  const real = prismaModule.default, transaction = real.$transaction.bind(real)
  return { ...prismaModule, default: new Proxy(real, { get(target, key) {
    if (key !== "$transaction") return Reflect.get(target, key)
    return async (callback: Parameters<typeof transaction>[0], options?: Parameters<typeof transaction>[1]) => {
      fault.transactions++
      if (fault.stage === "issued before transaction") await real.invoice.update({ where: { id: fault.target }, data: { status: "SENT", lockedAt: new Date("2030-01-01") } })
      return transaction(tx => callback(new Proxy(tx, { get(client, delegate) {
        if (!["invoice", "timeEntry", "auditLog"].includes(String(delegate))) return Reflect.get(client, delegate)
        const model = Reflect.get(client, delegate)
        return new Proxy(model, { get(object, operation) {
          if ((delegate === "timeEntry" && operation === "updateMany" && fault.stage === "release") || (delegate === "invoice" && operation === "deleteMany" && fault.stage === "delete") || (delegate === "auditLog" && operation === "create" && fault.stage === "audit")) return () => { throw new Error(`Fictional ${fault.stage} outage`) }
          if (delegate === "auditLog" && operation === "create") return async (...args: unknown[]) => {
            expect(getContext()?.timeInvoiceReleaseId).toBeUndefined()
            return Reflect.apply(Reflect.get(object, operation), object, args)
          }
          if (delegate === "invoice" && operation === "findFirst") return async (...args: unknown[]) => {
            const value = await Reflect.apply(Reflect.get(object, operation), object, args)
            if (fault.read) { const signal = fault.read; fault.read = null; signal(); await fault.wait }
            return value
          }
          return Reflect.get(object, operation)
        } })
      } })), options)
    }
  } }) }
})
import prisma from "@/lib/prisma"
import { deleteInvoice } from "@/actions/factures"
import { getContext, requestContext, type RequestContext } from "@/lib/context"
import { revalidatePath } from "next/cache"

describe.sequential("Finance releases only times for an accessible draft deletion in SQL", () => {
  let membershipId: string, agencyId: string, otherAgencyId: string, foreignCompanyId: string, clientId: string, otherClientId: string, foreignClientId: string, projectId: string, secondProjectId: string, otherClientProjectId: string, otherAgencyProjectId: string, foreignProjectId: string
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional draft time release" } })).id
    foreignCompanyId = (await prisma.company.create({ data: { name: "Fictional foreign draft time release" } })).id
    session.userId = (await prisma.user.create({ data: { email: `time-release-${randomUUID()}@example.test` } })).id
    membershipId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "ACCOUNTING", status: "ACTIVE" } })).id
    agencyId = (await prisma.agency.create({ data: { companyId: session.companyId, code: "OWN", name: "Fictional assigned agency" } })).id
    otherAgencyId = (await prisma.agency.create({ data: { companyId: session.companyId, code: "OTHER", name: "Fictional other agency" } })).id
    await prisma.agencyMembership.create({ data: { membershipId, agencyId } })
    clientId = (await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional release customer" } })).id
    otherClientId = (await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional other release customer" } })).id
    foreignClientId = (await prisma.client.create({ data: { companyId: foreignCompanyId, name: "Fictional foreign release customer" } })).id
    const project = async (name: string, company = session.companyId, customer = clientId, agency: string | null = agencyId) => (await prisma.project.create({ data: { companyId: company, clientId: customer, agencyId: agency, name } })).id
    projectId = await project("Fictional release project"); secondProjectId = await project("Fictional second release project")
    otherClientProjectId = await project("Fictional different customer project", session.companyId, otherClientId)
    otherAgencyProjectId = await project("Fictional unassigned project", session.companyId, clientId, otherAgencyId)
    foreignProjectId = await project("Fictional foreign project", foreignCompanyId, foreignClientId, null)
  })
  afterEach(async () => {
    fault.stage = ""; fault.transactions = 0; fault.target = ""; fault.read = null; fault.wait = null; vi.clearAllMocks(); vi.unstubAllEnvs()
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "ACCOUNTING", status: "ACTIVE" } })
    await prisma.timeEntry.deleteMany({ where: { projectId: { in: [projectId, secondProjectId, otherClientProjectId, otherAgencyProjectId, foreignProjectId] } } })
    await prisma.invoice.deleteMany({ where: { companyId: { in: [session.companyId, foreignCompanyId] } } }); await prisma.auditLog.deleteMany({ where: { userId: session.userId } })
  })
  afterAll(async () => {
    const where = { companyId: { in: [session.companyId, foreignCompanyId] } }
    await prisma.project.deleteMany({ where }); await prisma.client.deleteMany({ where }); await prisma.company.deleteMany({ where: { id: { in: [session.companyId, foreignCompanyId] } } }); await prisma.user.delete({ where: { id: session.userId } })
  })
  const invoice = (project: string | null = projectId, client = clientId, company = session.companyId) => prisma.invoice.create({ data: { companyId: company, clientId: client, projectId: project, number: `FICTIONAL-${randomUUID()}`, object: "Fictional release draft", dueDate: new Date("2030-02-01"), totalHtCents: 10000, totalTvaCents: 0, totalTtcCents: 10000, lines: { create: { label: "Fictional release time", quantity: 1, unitPriceCents: 10000, tvaRate: 0 } } }, include: { lines: true } })
  const row = (invoiceId: string, project = projectId) => prisma.timeEntry.create({ data: { projectId: project, invoiceId, durationSec: 3600, description: "Fictional allocated time", date: new Date("2030-01-01") } })
  const context = (): RequestContext => ({ userId: session.userId, companyId: session.companyId, membershipId, role: "ACCOUNTING", agencyIds: [agencyId], actionPermission: "finance.write" })
  async function preserved(doc: Awaited<ReturnType<typeof invoice>>, entries: Awaited<ReturnType<typeof row>>[]) {
    expect(await prisma.invoice.findUniqueOrThrow({ where: { id: doc.id }, include: { lines: true } })).toEqual(doc)
    for (const entry of entries) expect(await prisma.timeEntry.findUniqueOrThrow({ where: { id: entry.id } })).toEqual(entry)
    expect(await prisma.auditLog.count({ where: { userId: session.userId, action: "DELETE_INVOICE" } })).toBe(0)
    expect(revalidatePath).not.toHaveBeenCalled(); expect(getContext()).toBeUndefined()
  }
  it.each(["ACCOUNTING", "OWNER", "ADMIN"])("deletes the draft, releases its time and writes one audit for %s", async role => {
    const doc = await invoice(), entry = await row(doc.id)
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    expect(await deleteInvoice(doc.id)).toEqual({ ok: true })
    expect(await prisma.invoice.findUnique({ where: { id: doc.id } })).toBeNull()
    expect(await prisma.invoiceLine.count({ where: { invoiceId: doc.id } })).toBe(0)
    expect(await prisma.timeEntry.findUniqueOrThrow({ where: { id: entry.id } })).toEqual({ ...entry, invoiceId: null })
    expect(await prisma.auditLog.count({ where: { userId: session.userId, action: "DELETE_INVOICE", resourceId: doc.id } })).toBe(1)
  })
  it.each(["SALES", "SERVICE", "OPERATIONS", "TECHNICIAN", "VIEWER"])("denies %s before a business transaction", async role => {
    const doc = await invoice(), entry = await row(doc.id); await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    await expect(deleteInvoice(doc.id)).rejects.toThrow("Vous n'avez pas les droits nécessaires pour cette action")
    expect(fault.transactions).toBe(0); await preserved(doc, [entry])
  })
  it("deletes a coherent draft without times", async () => {
    const doc = await invoice(); expect(await deleteInvoice(doc.id)).toEqual({ ok: true })
    expect(await prisma.invoice.findUnique({ where: { id: doc.id } })).toBeNull()
  })
  it.each(["SENT", "PAID", "OVERDUE", "CANCELLED", "locked draft"])("preserves the %s document and its allocations", async status => {
    const doc = await invoice(), entry = await row(doc.id)
    const current = await prisma.invoice.update({ where: { id: doc.id }, data: status === "locked draft" ? { lockedAt: new Date("2030-01-01") } : { status }, include: { lines: true } })
    await expect(deleteInvoice(doc.id)).rejects.toThrow("Seules les factures en brouillon peuvent être supprimées")
    await preserved(current, [entry])
  })
  it.each(["foreign invoice", "foreign client", "foreign project", "different project client", "unassigned agency"])("refuses the draft's %s reference", async kind => {
    const doc = await invoice(kind === "foreign project" ? foreignProjectId : kind === "different project client" ? otherClientProjectId : kind === "unassigned agency" ? otherAgencyProjectId : projectId, kind === "foreign client" || kind === "foreign invoice" ? foreignClientId : clientId, kind === "foreign invoice" ? foreignCompanyId : session.companyId)
    const entry = await row(doc.id)
    await expect(deleteInvoice(doc.id)).rejects.toThrow("Facture introuvable"); await preserved(doc, [entry])
  })
  it.each(["foreign company", "different client", "different project", "unassigned agency"])("rolls back the partial release when a linked time has a %s", async kind => {
    const doc = await invoice(), own = await row(doc.id), invalid = await row(doc.id, kind === "foreign company" ? foreignProjectId : kind === "different client" ? otherClientProjectId : kind === "different project" ? secondProjectId : otherAgencyProjectId)
    await expect(deleteInvoice(doc.id)).rejects.toThrow("Facture introuvable"); await preserved(doc, [own, invalid])
  })
  it.each(["release", "delete", "audit"])("rolls back the document, lines and allocations after a %s outage", async stage => {
    const doc = await invoice(), entry = await row(doc.id); fault.stage = stage
    await expect(deleteInvoice(doc.id)).rejects.toThrow(`Fictional ${stage} outage`); await preserved(doc, [entry])
  })
  it("preserves an issued state committed after the request starts", async () => {
    const doc = await invoice(), entry = await row(doc.id)
    if (process.env.DATABASE_URL?.startsWith("postgres")) {
      let resume!: () => void
      const read = new Promise<void>(resolve => { fault.read = resolve })
      fault.wait = new Promise<void>(resolve => { resume = resolve })
      const pending = deleteInvoice(doc.id); const rejected = expect(pending).rejects.toThrow()
      await read
      try { await prisma.invoice.update({ where: { id: doc.id }, data: { status: "SENT", lockedAt: new Date("2030-01-01") } }) }
      finally { resume() }
      await rejected
    } else {
      fault.stage = "issued before transaction"; fault.target = doc.id
      await expect(deleteInvoice(doc.id)).rejects.toThrow("Seules les factures en brouillon peuvent être supprimées")
    }
    const current = await prisma.invoice.findUniqueOrThrow({ where: { id: doc.id }, include: { lines: true } })
    expect(current).toMatchObject({ status: "SENT", lockedAt: new Date("2030-01-01"), lines: doc.lines })
    await preserved(current, [entry])
  })
  it.each(["missing capability", "wrong target", "extra field", "claim instead", "read action"])("denies a direct detach with %s", async kind => {
    const doc = await invoice(), entry = await row(doc.id)
    const ctx = { ...context(), ...(kind === "missing capability" ? {} : { timeInvoiceReleaseId: kind === "wrong target" ? "different" : doc.id }), ...(kind === "read action" ? { actionPermission: "finance.read" as const } : {}) }
    await expect(requestContext.run(ctx, async () => await prisma.timeEntry.updateMany({ where: { invoiceId: doc.id }, data: kind === "extra field" ? { invoiceId: null, isBillable: false } : { invoiceId: kind === "claim instead" ? "different" : null } }))).rejects.toThrow("FORBIDDEN:operations.write")
    await preserved(doc, [entry])
  })
  it("keeps the count exception limited to the exact draft and write action", async () => {
    const doc = await invoice(); await row(doc.id); await row(doc.id, foreignProjectId)
    expect(await requestContext.run(context(), async () => await prisma.timeEntry.count({ where: { invoiceId: doc.id } }))).toBe(1)
    expect(await requestContext.run({ ...context(), timeInvoiceReleaseId: "different" }, async () => await prisma.timeEntry.count({ where: { invoiceId: doc.id } }))).toBe(1)
    expect(await requestContext.run({ ...context(), actionPermission: "finance.read", timeInvoiceReleaseId: doc.id }, async () => await prisma.timeEntry.count({ where: { invoiceId: doc.id } }))).toBe(1)
    expect(await requestContext.run({ ...context(), timeInvoiceReleaseId: doc.id }, async () => await prisma.timeEntry.count({ where: { invoiceId: doc.id } }))).toBe(2)
  })
  it.each(["", { not: "" }])("rejects invalid or filter-shaped identifiers before a transaction: %s", async id => {
    const doc = await invoice(), entry = await row(doc.id)
    await expect(deleteInvoice(id as unknown as string)).rejects.toThrow(); expect(fault.transactions).toBe(0); await preserved(doc, [entry])
  })
  it("blocks the public read-only demo before a transaction", async () => {
    const doc = await invoice(), entry = await row(doc.id); vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    await expect(deleteInvoice(doc.id)).rejects.toThrow(/démonstration/i); expect(fault.transactions).toBe(0); await preserved(doc, [entry])
  })
})
