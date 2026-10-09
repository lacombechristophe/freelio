import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import type { Prisma } from "@prisma/client"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import prisma from "@/lib/prisma"
import { createRecurringInvoice, deleteRecurringInvoice, getRecurringInvoiceChoices, getRecurringInvoices, toggleRecurringInvoice } from "@/actions/factures"
import { processDueRecurringInvoices } from "@/lib/scheduling/business"

describe.sequential("recurring invoice read scope on real SQL", () => {
  let foreignCompanyId: string, membershipId: string, localId: string, otherAgencyId: string, inconsistentId: string
  let clientId: string, projectId: string, localAgencyId: string, otherProjectId: string, foreignProjectId: string, foreignClientId: string
  const template = (project: string | null) => ({ object: "Fictional recurring service", projectId: project, dueDays: 30, lines: [{ label: "Fictional line", quantity: 1, unitPriceCents: 10000, tvaRate: 0 }] })
  const plan = (overrides: Partial<Prisma.RecurringInvoiceUncheckedCreateInput> = {}) => prisma.recurringInvoice.create({ data: { companyId: session.companyId, clientId, projectId, label: "Fictional recurrence", frequency: "MONTHLY", nextGenDate: new Date("2030-01-01"), template: template(projectId), ...overrides } })
  const input = () => ({ clientId, projectId, label: "Fictional created recurrence", object: "Fictional service", frequency: "MONTHLY" as const, nextGenDate: "2030-01-01", dueDays: 30, lines: template(projectId).lines })
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional recurring scope" } })).id
    foreignCompanyId = (await prisma.company.create({ data: { name: "Fictional foreign recurring scope" } })).id
    session.userId = (await prisma.user.create({ data: { email: `recurring-read-${randomUUID()}@example.test` } })).id
    membershipId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    const localAgency = await prisma.agency.create({ data: { companyId: session.companyId, name: "Fictional local agency", code: "LOCAL" } })
    const otherAgency = await prisma.agency.create({ data: { companyId: session.companyId, name: "Fictional other agency", code: "OTHER" } })
    await prisma.agencyMembership.create({ data: { membershipId, agencyId: localAgency.id } })
    const client = await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional local recurring client" } })
    const foreignClient = await prisma.client.create({ data: { companyId: foreignCompanyId, name: "Fictional foreign recurring client" } })
    const localProject = await prisma.project.create({ data: { companyId: session.companyId, clientId: client.id, agencyId: localAgency.id, name: "Fictional local recurring project" } })
    const otherProject = await prisma.project.create({ data: { companyId: session.companyId, clientId: client.id, agencyId: otherAgency.id, name: "Fictional other recurring project" } })
    clientId = client.id
    projectId = localProject.id
    localAgencyId = localAgency.id
    otherProjectId = otherProject.id
    foreignClientId = foreignClient.id
    foreignProjectId = (await prisma.project.create({ data: { companyId: foreignCompanyId, clientId: foreignClient.id, name: "Fictional foreign recurring project" } })).id
    async function plan(label: string, clientId: string, projectId: string) {
      return (await prisma.recurringInvoice.create({ data: { companyId: session.companyId, clientId, projectId, label, frequency: "MONTHLY", nextGenDate: new Date("2030-01-01"), template: { object: "Fictional recurring service", projectId, dueDays: 30, lines: [{ label: "Fictional line", quantity: 1, unitPriceCents: 10000, tvaRate: 0 }] } } })).id
    }
    localId = await plan("Fictional local recurrence", client.id, localProject.id)
    otherAgencyId = await plan("Fictional other agency recurrence", client.id, otherProject.id)
    inconsistentId = await plan("Fictional inconsistent recurrence", foreignClient.id, localProject.id)
  })
  afterEach(async () => { if (membershipId) await prisma.membership.update({ where: { id: membershipId }, data: { role: "OWNER", status: "ACTIVE" } }) })
  afterAll(async () => {
    const ids = [session.companyId, foreignCompanyId].filter(Boolean), where = { companyId: { in: ids } }
    if (ids.length) {
      await prisma.recurringInvoice.deleteMany({ where })
      await prisma.invoice.deleteMany({ where })
      await prisma.maintenanceContract.deleteMany({ where })
      await prisma.project.deleteMany({ where })
      await prisma.customerSite.deleteMany({ where })
      await prisma.auditLog.deleteMany({ where: { userId: session.userId } })
      await prisma.client.deleteMany({ where })
      await prisma.company.deleteMany({ where: { id: { in: ids } } })
    }
    if (session.userId) await prisma.user.delete({ where: { id: session.userId } })
  })
  it.each(["SALES", "OPERATIONS", "TECHNICIAN", "SERVICE"])("refuses recurrence templates without Finance for %s", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    await expect(getRecurringInvoices()).rejects.toThrow("droits")
  })
  it("excludes another agency recurrence from Accounting", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "ACCOUNTING" } })
    expect((await getRecurringInvoices()).items.map(plan => plan.id)).not.toContain(otherAgencyId)
  })
  it("excludes a recurrence whose client belongs to another company", async () => {
    expect((await getRecurringInvoices()).items.map(plan => plan.id)).not.toContain(inconsistentId)
  })
  it("preserves coherent recurrence templates for Owner", async () => {
    expect((await getRecurringInvoices()).items.map(plan => plan.id)).toEqual(expect.arrayContaining([localId, otherAgencyId]))
  })
  it("preserves a coherent local recurrence for Accounting", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "ACCOUNTING" } })
    expect((await getRecurringInvoices()).items.map(plan => plan.id)).toContain(localId)
  })
  it("reserves unassigned historical models to Owner and Admin", async () => {
    const legacy = await plan({ projectId: null, template: template(null) })
    expect((await getRecurringInvoices()).items.map(item => item.id)).toContain(legacy.id)
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "ADMIN" } })
    expect((await getRecurringInvoices()).items.map(item => item.id)).toContain(legacy.id)
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "ACCOUNTING" } })
    expect((await getRecurringInvoices()).items.map(item => item.id)).not.toContain(legacy.id)
  })
  it("excludes a project belonging to a different client of the same company", async () => {
    const other = await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional other recurring client" } })
    const invalid = await plan({ clientId: other.id })
    expect((await getRecurringInvoices()).items.map(item => item.id)).not.toContain(invalid.id)
    await expect(toggleRecurringInvoice(invalid.id, false)).rejects.toThrow("introuvable")
  })
  it("migrates only valid legacy JSON projects and preserves invalid references", async () => {
    const valid = await plan({ projectId: null })
    const invalid = await plan({ projectId: null, template: template(foreignProjectId) })
    const missing = await plan({ projectId: null, template: template("fictional-missing-recurring-project") })
    const inconsistent = await plan({ projectId: null, clientId: foreignClientId })
    const before = await prisma.recurringInvoice.findMany({ where: { id: { in: [valid.id, invalid.id, missing.id, inconsistent.id] } }, select: { id: true, template: true, nextGenDate: true, isActive: true }, orderBy: { id: "asc" } })
    const file = process.env.DATABASE_URL?.startsWith("file:") ? "prisma/sqlite/backfill-recurring-projects.sql" : "prisma/postgresql/migrations/20261009010000_recurring_project_scope/migration.sql"
    const source = await readFile(file, "utf8")
    const update = source.slice(source.indexOf('UPDATE "RecurringInvoice"'))
    await prisma.$executeRawUnsafe(update)
    await prisma.$executeRawUnsafe(update)
    expect((await prisma.recurringInvoice.findUnique({ where: { id: valid.id } }))?.projectId).toBe(projectId)
    for (const item of [invalid, missing, inconsistent]) expect((await prisma.recurringInvoice.findUnique({ where: { id: item.id } }))?.projectId).toBeNull()
    expect(await prisma.recurringInvoice.findMany({ where: { id: { in: before.map(item => item.id) } }, select: { id: true, template: true, nextGenDate: true, isActive: true }, orderBy: { id: "asc" } })).toEqual(before)
    const visible = (await getRecurringInvoices()).items.map(item => item.id)
    expect(visible).toContain(valid.id)
    for (const item of [invalid, missing, inconsistent]) expect(visible).not.toContain(item.id)
  })
  it("blocks generation of an unbound legacy project without changing its schedule", async () => {
    const legacy = await plan({ projectId: null, nextGenDate: new Date("1990-01-01") })
    expect(await processDueRecurringInvoices({ companyId: session.companyId })).toMatchObject({ generated: 0, failed: 1 })
    expect(await prisma.recurringInvoice.findUnique({ where: { id: legacy.id } })).toMatchObject({ nextGenDate: legacy.nextGenDate, isActive: true, lastGenDate: null })
    expect(await prisma.invoice.count({ where: { companyId: session.companyId } })).toBe(0)
    await prisma.recurringInvoice.delete({ where: { id: legacy.id } })
  })
  it("checks both project and maintenance agency when both references exist", async () => {
    const otherProject = await prisma.project.findUniqueOrThrow({ where: { id: otherProjectId } })
    const site = await prisma.customerSite.create({ data: { companyId: session.companyId, clientId, agencyId: otherProject.agencyId, label: "Fictional recurring maintenance site", address1: "Fictional address" } })
    const maintenance = await prisma.maintenanceContract.create({ data: { companyId: session.companyId, clientId, siteId: site.id, label: "Fictional recurring maintenance", number: "LOCAL", startDate: new Date("2030-01-01") } })
    const both = await plan({ maintenanceContractId: maintenance.id })
    expect((await getRecurringInvoices()).items.map(item => item.id)).toContain(both.id)
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "ACCOUNTING" } })
    expect((await getRecurringInvoices()).items.map(item => item.id)).not.toContain(both.id)
    await expect(deleteRecurringInvoice(both.id)).rejects.toThrow("introuvable")
    await prisma.recurringInvoice.update({ where: { id: both.id }, data: { projectId: null, template: template(null) } })
    expect((await getRecurringInvoices()).items.map(item => item.id)).not.toContain(both.id)
    await prisma.agencyMembership.create({ data: { agencyId: site.agencyId!, membershipId } })
    try {
      expect((await getRecurringInvoices()).items.map(item => item.id)).toContain(both.id)
    } finally { await prisma.agencyMembership.deleteMany({ where: { agencyId: site.agencyId!, membershipId } }) }
  })
  it("rejects an incoherent maintenance site in reads and generation", async () => {
    const site = await prisma.customerSite.create({ data: { companyId: foreignCompanyId, clientId: foreignClientId, label: "Fictional foreign recurring site", address1: "Fictional address" } })
    const maintenance = await prisma.maintenanceContract.create({ data: { companyId: session.companyId, clientId, siteId: site.id, number: "INCONSISTENT-SITE", label: "Fictional inconsistent maintenance", startDate: new Date("1990-01-01") } })
    const invalid = await plan({ maintenanceContractId: maintenance.id, nextGenDate: new Date("1990-01-01") })
    expect((await getRecurringInvoices()).items.map(item => item.id)).not.toContain(invalid.id)
    await expect(toggleRecurringInvoice(invalid.id, true)).rejects.toThrow("introuvable")
    expect(await processDueRecurringInvoices({ companyId: session.companyId })).toMatchObject({ generated: 0, failed: 1 })
    expect(await prisma.invoice.count({ where: { companyId: session.companyId } })).toBe(0)
    await prisma.recurringInvoice.delete({ where: { id: invalid.id } })
  })
  it.each(["SALES", "OPERATIONS", "TECHNICIAN", "SERVICE", "VIEWER"])("refuses direct mutations without Finance write for %s", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    await expect(createRecurringInvoice(input())).rejects.toThrow("droits")
    await expect(toggleRecurringInvoice(localId, false)).rejects.toThrow("droits")
    await expect(deleteRecurringInvoice(localId)).rejects.toThrow("droits")
    expect((await prisma.recurringInvoice.findUnique({ where: { id: localId } }))?.isActive).toBe(true)
  })
  it("requires and stores a coherent project for Accounting", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "ACCOUNTING" } })
    await expect(createRecurringInvoice({ ...input(), projectId: undefined })).rejects.toThrow("chantier")
    await expect(createRecurringInvoice({ ...input(), projectId: otherProjectId })).rejects.toThrow("incompatible")
    const created = await createRecurringInvoice(input())
    expect(created).toMatchObject({ projectId, template: { projectId } })
    expect(await toggleRecurringInvoice(created.id, false)).toMatchObject({ isActive: false })
    await deleteRecurringInvoice(created.id)
  })
  it("keeps generated invoices when an accessible recurrence is deleted", async () => {
    const recurring = await plan()
    const invoice = await prisma.invoice.create({ data: { companyId: session.companyId, clientId, projectId, number: "GENERATED", object: "Fictional generated recurring invoice", dueDate: new Date("2030-01-01"), totalHtCents: 10000, totalTvaCents: 0, totalTtcCents: 10000 } })
    await prisma.recurringInvoiceOccurrence.create({ data: { recurringId: recurring.id, invoiceId: invoice.id, scheduledFor: recurring.nextGenDate } })
    await deleteRecurringInvoice(recurring.id)
    expect(await prisma.invoice.findUnique({ where: { id: invoice.id } })).not.toBeNull()
    expect(await prisma.recurringInvoiceOccurrence.count({ where: { recurringId: recurring.id } })).toBe(0)
  })
  it("paginates and searches every eligible recurrence with stable order", async () => {
    const prefix = `Volume ${randomUUID()}`
    await prisma.recurringInvoice.createMany({ data: Array.from({ length: 530 }, (_, index) => ({ companyId: session.companyId, clientId, projectId, label: `${prefix} ${String(index).padStart(3, "0")}`, frequency: "MONTHLY", nextGenDate: new Date("2030-01-01"), template: template(projectId) })) })
    const first = await getRecurringInvoices({ search: prefix })
    const second = await getRecurringInvoices({ search: prefix, page: 2 })
    expect(first).toMatchObject({ total: 530, page: 1 })
    expect(first.items).toHaveLength(25)
    expect(second.items).toHaveLength(25)
    expect(second.items.map(item => item.id).some(id => first.items.some(item => item.id === id))).toBe(false)
    expect(await getRecurringInvoices({ search: `${prefix} 529` })).toMatchObject({ total: 1 })
    const last = await getRecurringInvoices({ search: prefix, page: 1_000_000 })
    expect(last).toMatchObject({ total: 530, page: 22 })
    expect(last.items).toHaveLength(5)
    await prisma.recurringInvoice.deleteMany({ where: { companyId: session.companyId, label: { startsWith: prefix } } })
  })
  it("treats search punctuation as literal text and binds SQL parameters", async () => {
    expect((await getRecurringInvoices({ search: "%" })).total).toBe(0)
    expect((await getRecurringInvoices({ search: "' OR TRUE; DROP TABLE RecurringInvoice; --" })).total).toBe(0)
    expect(await prisma.recurringInvoice.count({ where: { companyId: session.companyId } })).toBeGreaterThan(0)
  })
  it("searches all clients and projects while preserving a selected choice", async () => {
    const prefix = `Volume ${randomUUID()}`
    const ids = Array.from({ length: 530 }, (_, index) => `c${randomUUID().replaceAll("-", "")}${index}`)
    await prisma.client.createMany({ data: ids.map((id, index) => ({ id, companyId: session.companyId, name: `${prefix} client ${String(index).padStart(3, "0")}` })) })
    const clients = await getRecurringInvoiceChoices({ kind: "CLIENT", search: prefix, page: 2, selectedId: ids[529] })
    expect(clients).toMatchObject({ total: 530, page: 2, selected: { id: ids[529] } })
    expect(clients.items).toHaveLength(25)
    await prisma.project.createMany({ data: ids.map((id, index) => ({ id: `p${id}`, companyId: session.companyId, clientId, agencyId: localAgencyId, name: `${prefix} project ${String(index).padStart(3, "0")}` })) })
    const projects = await getRecurringInvoiceChoices({ kind: "PROJECT", clientId, search: prefix, page: 22, selectedId: `p${ids[0]}` })
    expect(projects).toMatchObject({ total: 530, page: 22, selected: { id: `p${ids[0]}` } })
    expect(projects.items).toHaveLength(5)
    const retained = await getRecurringInvoiceChoices({ kind: "PROJECT", clientId, search: "unmatched search", selectedId: `p${ids[0]}` })
    expect(retained).toMatchObject({ total: 0, selected: { id: `p${ids[0]}` } })
    expect((await getRecurringInvoiceChoices({ kind: "CLIENT", selectedId: foreignClientId })).selected).toBeNull()
    expect((await getRecurringInvoiceChoices({ kind: "PROJECT", clientId, selectedId: foreignProjectId })).selected).toBeNull()
    await prisma.project.deleteMany({ where: { id: { in: ids.map(id => `p${id}`) } } })
    await prisma.client.deleteMany({ where: { id: { in: ids } } })
  })
  it("rechecks revoked agency assignments for reads, choices and mutations", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "ACCOUNTING" } })
    await prisma.agencyMembership.deleteMany({ where: { agencyId: localAgencyId, membershipId } })
    try {
      expect((await getRecurringInvoices()).total).toBe(0)
      expect((await getRecurringInvoiceChoices({ kind: "PROJECT", clientId, selectedId: projectId })).selected).toBeNull()
      await expect(toggleRecurringInvoice(localId, false)).rejects.toThrow("introuvable")
    } finally { await prisma.agencyMembership.create({ data: { agencyId: localAgencyId, membershipId } }) }
  })
  it("refuses every recurrence mutation in the public read-only demo", async () => {
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    try {
      await expect(createRecurringInvoice(input())).rejects.toThrow("lecture seule")
      await expect(toggleRecurringInvoice(localId, false)).rejects.toThrow("lecture seule")
      await expect(deleteRecurringInvoice(localId)).rejects.toThrow("lecture seule")
    } finally { vi.unstubAllEnvs() }
  })
})
