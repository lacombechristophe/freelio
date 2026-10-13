import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
const fault = vi.hoisted(() => ({ stage: "", transactions: 0 }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/finance/issued-invoice", () => ({ prepareIssuedInvoice: vi.fn(), discardIssuedInvoice: vi.fn() }))
vi.mock("@/lib/prisma", async importOriginal => {
  const prismaModule = await importOriginal<typeof import("@/lib/prisma")>()
  const real = prismaModule.default, transaction = real.$transaction.bind(real)
  return { ...prismaModule, default: new Proxy(real, { get(target, key) {
    if (key !== "$transaction") return Reflect.get(target, key)
    return (callback: Parameters<typeof transaction>[0], options?: Parameters<typeof transaction>[1]) => {
      fault.transactions++
      return transaction(tx => callback(new Proxy(tx, { get(client, delegate) {
        if (!["timeEntry", "auditLog"].includes(String(delegate))) return Reflect.get(client, delegate)
        const model = Reflect.get(client, delegate)
        return new Proxy(model, { get(object, operation) {
          if ((delegate === "timeEntry" && operation === "updateMany" && fault.stage === "claim") || (delegate === "auditLog" && operation === "create" && fault.stage === "audit")) return () => { throw new Error(`Fictional ${fault.stage} outage`) }
          if (delegate === "auditLog" && operation === "create") return async (...args: unknown[]) => {
            expect(getContext()?.timeInvoiceClaimId).toBeUndefined()
            return Reflect.apply(Reflect.get(object, operation), object, args)
          }
          return Reflect.get(object, operation)
        } })
      } })), options)
    }
  } }) }
})
import prisma from "@/lib/prisma"
import { createInvoiceFromTimeEntries, getUnbilledTimeEntries } from "@/actions/factures"
import { createTimeEntry, deleteTimeEntry, updateTimeEntry } from "@/actions/temps"
import { getContext, requestContext, type RequestContext } from "@/lib/context"
import { withAuth } from "@/lib/auth-wrapper"
import { revalidatePath } from "next/cache"

describe.sequential("Accounting claims only times for its newly created draft in SQL", () => {
  let membershipId: string, clientId: string, foreignClientId: string, projectId: string, secondProjectId: string, foreignProjectId: string, invalidProjectId: string, otherProjectId: string, foreignAgencyProjectId: string, foreignCompanyId: string, agencyId: string
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional Accounting billing", isTvaApplicable: false } })).id
    foreignCompanyId = (await prisma.company.create({ data: { name: "Fictional foreign Accounting billing" } })).id
    session.userId = (await prisma.user.create({ data: { email: `time-accounting-${randomUUID()}@example.test` } })).id
    membershipId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "ACCOUNTING", status: "ACTIVE" } })).id
    agencyId = (await prisma.agency.create({ data: { companyId: session.companyId, code: "OWN", name: "Fictional assigned agency" } })).id
    const otherAgency = await prisma.agency.create({ data: { companyId: session.companyId, code: "OTHER", name: "Fictional other agency" } })
    const foreignAgency = await prisma.agency.create({ data: { companyId: foreignCompanyId, code: "FOREIGN", name: "Fictional foreign agency" } })
    await prisma.agencyMembership.create({ data: { membershipId, agencyId } })
    clientId = (await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional own billing customer" } })).id
    foreignClientId = (await prisma.client.create({ data: { companyId: foreignCompanyId, name: "Fictional foreign billing customer" } })).id
    projectId = (await prisma.project.create({ data: { companyId: session.companyId, clientId, agencyId, name: "Fictional billing project" } })).id
    secondProjectId = (await prisma.project.create({ data: { companyId: session.companyId, clientId, agencyId, name: "Fictional second billing project" } })).id
    foreignProjectId = (await prisma.project.create({ data: { companyId: foreignCompanyId, clientId: foreignClientId, name: "Fictional foreign project" } })).id
    invalidProjectId = (await prisma.project.create({ data: { companyId: session.companyId, clientId: foreignClientId, agencyId, name: "Fictional invalid customer" } })).id
    otherProjectId = (await prisma.project.create({ data: { companyId: session.companyId, clientId, agencyId: otherAgency.id, name: "Fictional unassigned project" } })).id
    foreignAgencyProjectId = (await prisma.project.create({ data: { companyId: session.companyId, clientId, agencyId: foreignAgency.id, name: "Fictional foreign agency project" } })).id
  })
  afterEach(async () => {
    fault.stage = ""; fault.transactions = 0; vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllEnvs()
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "ACCOUNTING", status: "ACTIVE" } })
    await prisma.project.update({ where: { id: projectId }, data: { clientId, agencyId } })
    await prisma.timeEntry.deleteMany({ where: { projectId: { in: [projectId, secondProjectId, foreignProjectId, invalidProjectId, otherProjectId, foreignAgencyProjectId] } } })
    await prisma.invoice.deleteMany({ where: { companyId: session.companyId } })
    await prisma.auditLog.deleteMany({ where: { userId: session.userId } })
  })
  afterAll(async () => {
    const where = { companyId: { in: [session.companyId, foreignCompanyId] } }
    await prisma.project.deleteMany({ where }); await prisma.client.deleteMany({ where })
    await prisma.company.deleteMany({ where: { id: { in: [session.companyId, foreignCompanyId] } } }); await prisma.user.delete({ where: { id: session.userId } })
  })
  const row = (project = projectId) => prisma.timeEntry.create({ data: { projectId: project, durationSec: 3600, description: "Fictional Accounting time", date: new Date("2030-01-01") } })
  const input = (...ids: string[]) => ({ timeEntryIds: ids, timeEntryVersions: [] as Array<{ id: string; version: string }>, hourlyRateCents: 10000, dueDate: "2030-02-01", lineMode: "DETAIL" as const })
  async function displayed(...ids: string[]) {
    const data = await getUnbilledTimeEntries()
    return { ...input(...ids), timeEntryVersions: data.entries.filter(entry => ids.includes(entry.id)).map(({ id, version }) => ({ id, version })) }
  }
  async function bill(data: Parameters<typeof createInvoiceFromTimeEntries>[0]) {
    const result = await createInvoiceFromTimeEntries(data)
    if (!result.ok) throw new Error(result.error)
    return prisma.invoice.findUniqueOrThrow({ where: { id: result.value.id } })
  }
  const context = (): RequestContext => ({ userId: session.userId, companyId: session.companyId, membershipId, role: "ACCOUNTING", agencyIds: [agencyId], actionPermission: "finance.write" })
  async function unchanged(entry: Awaited<ReturnType<typeof row>>) {
    expect(await prisma.timeEntry.findUniqueOrThrow({ where: { id: entry.id } })).toEqual(entry)
    expect(await prisma.invoice.count({ where: { companyId: session.companyId } })).toBe(0)
    expect(await prisma.invoiceLine.count({ where: { invoice: { companyId: session.companyId } } })).toBe(0)
    expect(await prisma.auditLog.count({ where: { userId: session.userId } })).toBe(0)
    expect(revalidatePath).not.toHaveBeenCalled()
  }
  it.each(["ACCOUNTING", "OWNER", "ADMIN"])("creates one accessible draft and audit for %s", async role => {
    const entry = await row(); await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    const invoice = await bill(await displayed(entry.id, entry.id))
    expect(invoice).toMatchObject({ companyId: session.companyId, clientId, projectId, status: "DRAFT", totalHtCents: 10000 })
    expect(await prisma.timeEntry.findUniqueOrThrow({ where: { id: entry.id } })).toEqual({ ...entry, invoiceId: invoice.id })
    expect(await prisma.auditLog.count({ where: { userId: session.userId, resourceId: invoice.id, action: "CREATE_INVOICE_FROM_TIME" } })).toBe(1)
    expect(getContext()).toBeUndefined()
  })
  it.each(["SALES", "SERVICE", "OPERATIONS", "TECHNICIAN", "VIEWER"])("denies %s before business SQL", async role => {
    const entry = await row(); await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    await expect(createInvoiceFromTimeEntries(input(entry.id))).rejects.toThrow("Vous n'avez pas les droits nécessaires pour cette action")
    expect(fault.transactions).toBe(0); await unchanged(entry)
  })
  it.each(["foreign project", "foreign client", "unassigned agency", "foreign agency"])("refuses %s without a draft or claim", async kind => {
    const entry = await row(kind === "foreign project" ? foreignProjectId : kind === "foreign client" ? invalidProjectId : kind === "unassigned agency" ? otherProjectId : foreignAgencyProjectId)
    expect(await createInvoiceFromTimeEntries(input(entry.id))).toEqual({ ok: false, error: "Les temps ont changé pendant la création de la facture. Rechargez la page puis réessayez." })
    await unchanged(entry)
  })
  it("refuses an agency withdrawal before preparing the draft", async () => {
    const entry = await row(), data = await displayed(entry.id); await prisma.agencyMembership.deleteMany({ where: { membershipId, agencyId } })
    try { expect(await createInvoiceFromTimeEntries(data)).toEqual({ ok: false, error: "Les temps ont changé pendant la création de la facture. Rechargez la page puis réessayez." }); await unchanged(entry) }
    finally { await prisma.agencyMembership.create({ data: { membershipId, agencyId } }) }
  })
  it.each(["client", "agency", "project"])("rechecks the %s reference at the claim", async kind => {
    const entry = await row(), data = await displayed(entry.id), read = prisma.timeEntry.findMany.bind(prisma.timeEntry)
    vi.spyOn(prisma.timeEntry, "findMany").mockImplementationOnce((async args => {
      const entries = await read(args)
      // An external writer changes only the relation after the real preflight read.
      await requestContext.run({ ...context(), role: "OWNER", agencyIds: null }, async () => {
        if (kind === "project") await prisma.timeEntry.update({ where: { id: entry.id }, data: { projectId: secondProjectId } })
        else await prisma.project.update({ where: { id: projectId }, data: kind === "client" ? { clientId: foreignClientId } : { agencyId: null } })
      })
      return entries
    }) as typeof prisma.timeEntry.findMany)
    expect(await createInvoiceFromTimeEntries(data)).toEqual({ ok: false, error: "Les temps ont changé pendant la création de la facture. Rechargez la page puis réessayez." })
    await unchanged({ ...entry, projectId: kind === "project" ? secondProjectId : projectId })
  })
  it("rolls back a multi-project draft which Accounting cannot subsequently read", async () => {
    const entry = await row(), other = await row(secondProjectId)
    await expect(createInvoiceFromTimeEntries(await displayed(entry.id, other.id))).rejects.toThrow("Facture introuvable")
    await unchanged(entry); expect(await prisma.timeEntry.findUniqueOrThrow({ where: { id: other.id } })).toEqual(other)
  })
  it.each(["claim", "audit"])("rolls back the draft, lines and times after a %s outage", async stage => {
    const entry = await row(), data = await displayed(entry.id); fault.stage = stage
    await expect(createInvoiceFromTimeEntries(data)).rejects.toThrow(`Fictional ${stage} outage`)
    await unchanged(entry); expect(getContext()).toBeUndefined()
  })
  it.each(["missing capability", "different invoice", "extra field", "detach", "already allocated", "read action"])("denies a direct Time update with %s", async kind => {
    const entry = await row(), claimId = "not-an-invoice"
    const ctx = { ...context(), ...(kind === "missing capability" ? {} : { timeInvoiceClaimId: claimId }), ...(kind === "read action" ? { actionPermission: "finance.read" as const } : {}) }
    await expect(requestContext.run(ctx, async () => await prisma.timeEntry.updateMany({ where: { id: entry.id, invoiceId: kind === "already allocated" ? claimId : null }, data: kind === "extra field" ? { invoiceId: claimId, durationSec: 7200 } : { invoiceId: kind === "detach" ? null : kind === "different invoice" ? "different" : claimId } }))).rejects.toThrow("FORBIDDEN:operations.write")
    await unchanged(entry)
  })
  it("restores the Finance context after the narrow claim", async () => {
    const entry = await row()
    await withAuth(async () => {
      await createInvoiceFromTimeEntries(await displayed(entry.id))
      expect(getContext()?.timeInvoiceClaimId).toBeUndefined()
      await expect(prisma.timeEntry.updateMany({ where: { id: entry.id }, data: { durationSec: 7200 } })).rejects.toThrow("FORBIDDEN:operations.write")
    }, "finance.write")
  })
  it("does not grant Accounting any general time action", async () => {
    const entry = await row()
    const refusal = { ok: false, error: "Vous n'avez pas les droits nécessaires pour cette action" }
    expect(await updateTimeEntry(entry.id, { durationSec: 7200 })).toEqual(refusal)
    expect(await deleteTimeEntry(entry.id)).toEqual(refusal)
    expect(await createTimeEntry({ projectId, durationSec: 3600, description: "Fictional forbidden creation", date: new Date("2030-01-01"), isBillable: true })).toEqual(refusal)
    await unchanged(entry)
  })
  it.each(["update", "delete"])("does not authorize a single-row %s even with the claim capability", async operation => {
    const entry = await row()
    await expect(requestContext.run({ ...context(), timeInvoiceClaimId: "not-an-invoice" }, async () => {
      if (operation === "delete") return await prisma.timeEntry.delete({ where: { id: entry.id } })
      return await prisma.timeEntry.update({ where: { id: entry.id }, data: { invoiceId: "not-an-invoice" } })
    })).rejects.toThrow("FORBIDDEN:operations.write")
    await unchanged(entry)
  })
  it("blocks the public read-only demo before creating a draft", async () => {
    const entry = await row(); vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    await expect(createInvoiceFromTimeEntries(input(entry.id))).rejects.toThrow(/démonstration/i)
    expect(fault.transactions).toBe(0); await unchanged(entry)
  })
})
