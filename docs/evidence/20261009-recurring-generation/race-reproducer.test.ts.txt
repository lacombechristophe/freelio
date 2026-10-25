import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
import prisma from "@/lib/prisma"
import { processDueMaintenanceVisits, processDueRecurringInvoices } from "@/lib/scheduling/business"

describe.sequential("recurring generation validates stored references on real SQL", () => {
  let companyId: string, foreignCompanyId: string, userId: string, foreignUserId: string
  let clientId: string, otherClientId: string, foreignClientId: string
  let projectId: string, otherClientProjectId: string, foreignProjectId: string, siteId: string
  const due = new Date("2026-01-01T00:00:00Z")
  const template = (project: string | null = projectId) => ({
    object: "Fictional recurring work", projectId: project, dueDays: 30,
    lines: [{ label: "Fictional service", quantity: 1, unitPriceCents: 1000, tvaRate: 20 }],
  })
  beforeAll(async () => {
    companyId = (await prisma.company.create({ data: { name: "Fictional recurring worker", isTvaApplicable: true } })).id
    foreignCompanyId = (await prisma.company.create({ data: { name: "Fictional other recurring worker" } })).id
    userId = (await prisma.user.create({ data: { email: `recurring-worker-${randomUUID()}@example.test` } })).id
    foreignUserId = (await prisma.user.create({ data: { email: `recurring-other-${randomUUID()}@example.test` } })).id
    await prisma.membership.create({ data: { companyId, userId, role: "OWNER", status: "ACTIVE" } })
    await prisma.membership.create({ data: { companyId: foreignCompanyId, userId: foreignUserId, role: "OWNER", status: "ACTIVE" } })
    clientId = (await prisma.client.create({ data: { companyId, name: "Fictional recurring buyer" } })).id
    otherClientId = (await prisma.client.create({ data: { companyId, name: "Fictional other buyer" } })).id
    foreignClientId = (await prisma.client.create({ data: { companyId: foreignCompanyId, name: "Fictional foreign buyer" } })).id
    projectId = (await prisma.project.create({ data: { companyId, clientId, name: "Fictional recurring project" } })).id
    otherClientProjectId = (await prisma.project.create({ data: { companyId, clientId: otherClientId, name: "Fictional wrong buyer project" } })).id
    foreignProjectId = (await prisma.project.create({ data: { companyId: foreignCompanyId, clientId: foreignClientId, name: "Fictional foreign project" } })).id
    siteId = (await prisma.customerSite.create({ data: { companyId, clientId, label: "Fictional worker site", address1: "1 rue Fictive" } })).id
  })
  beforeEach(async () => {
    await prisma.membership.updateMany({ where: { companyId, userId }, data: { role: "OWNER", status: "ACTIVE" } })
    await prisma.fieldIntervention.deleteMany({ where: { companyId } })
    await prisma.maintenanceContract.deleteMany({ where: { companyId } })
    await prisma.recurringInvoiceOccurrence.deleteMany({ where: { recurring: { companyId } } })
    await prisma.recurringInvoice.deleteMany({ where: { companyId } })
    await prisma.invoice.deleteMany({ where: { companyId } })
    await prisma.auditLog.deleteMany({ where: { userId: { in: [userId, foreignUserId] } } })
  })
  afterEach(() => vi.restoreAllMocks())
  afterAll(async () => {
    if (!companyId || !foreignCompanyId) return
    const companies = [companyId, foreignCompanyId]
    await prisma.fieldIntervention.deleteMany({ where: { companyId: { in: companies } } })
    await prisma.recurringInvoiceOccurrence.deleteMany({ where: { recurring: { companyId: { in: companies } } } })
    await prisma.recurringInvoice.deleteMany({ where: { companyId: { in: companies } } })
    await prisma.maintenanceContract.deleteMany({ where: { companyId: { in: companies } } })
    await prisma.customerSite.deleteMany({ where: { companyId: { in: companies } } })
    await prisma.invoice.deleteMany({ where: { companyId: { in: companies } } })
    await prisma.auditLog.deleteMany({ where: { userId: { in: [userId, foreignUserId] } } })
    await prisma.project.deleteMany({ where: { companyId: { in: companies } } })
    await prisma.client.deleteMany({ where: { companyId: { in: companies } } })
    await prisma.membership.deleteMany({ where: { companyId: { in: companies } } })
    await prisma.company.deleteMany({ where: { id: { in: companies } } })
    await prisma.user.deleteMany({ where: { id: { in: [userId, foreignUserId] } } })
  })
  const create = (client = clientId, project: string | null = projectId) => prisma.recurringInvoice.create({ data: { companyId, clientId: client, label: "Fictional worker plan", frequency: "MONTHLY", nextGenDate: due, template: template(project) } })

  it("generates a coherent draft, occurrence and audit without issuing the invoice", async () => {
    const recurring = await create()
    expect(await processDueRecurringInvoices({ companyId })).toMatchObject({ generated: 1, failed: 0 })
    expect(await prisma.invoice.findFirst({ where: { companyId } })).toMatchObject({ status: "DRAFT", clientId, projectId, totalTtcCents: 1200 })
    expect(await prisma.recurringInvoiceOccurrence.count({ where: { recurringId: recurring.id } })).toBe(1)
    expect(await prisma.auditLog.count({ where: { userId, action: "GENERATE_RECURRING_INVOICE" } })).toBe(1)
  })
  it("does not generate twice for the same scheduled date", async () => {
    const recurring = await create()
    await processDueRecurringInvoices({ companyId })
    await prisma.recurringInvoice.update({ where: { id: recurring.id }, data: { nextGenDate: due } })
    expect(await processDueRecurringInvoices({ companyId })).toMatchObject({ generated: 0, skipped: 1 })
    expect(await prisma.invoice.count({ where: { companyId } })).toBe(1)
  })
  it("reports a second worker committing after the initial read as skipped", async () => {
    const recurring = await create()
    const findOccurrence = prisma.recurringInvoiceOccurrence.findUnique.bind(prisma.recurringInvoiceOccurrence)
    let secondResult: Awaited<ReturnType<typeof processDueRecurringInvoices>> | undefined
    vi.spyOn(prisma.recurringInvoiceOccurrence, "findUnique").mockImplementationOnce((args) => {
      const read = findOccurrence(args)
      return read.then(async (observed) => {
        expect(observed).toBeNull()
        secondResult = await processDueRecurringInvoices({ companyId })
        return observed
      }) as typeof read
    })
    const result = await processDueRecurringInvoices({ companyId })
    expect(secondResult).toMatchObject({ generated: 1, failed: 0 })
    expect(result).toMatchObject({ generated: 0, skipped: 1, failed: 0 })
    expect(await prisma.invoice.count({ where: { companyId } })).toBe(1)
    expect(await prisma.recurringInvoiceOccurrence.count({ where: { recurringId: recurring.id } })).toBe(1)
    expect(await prisma.auditLog.count({ where: { userId, action: "GENERATE_RECURRING_INVOICE" } })).toBe(1)
  })
  it("rejects a local plan referencing a foreign client before writing a draft", async () => {
    await create(foreignClientId, null)
    await processDueRecurringInvoices({ companyId })
    expect(await prisma.invoice.count({ where: { companyId } })).toBe(0)
  })
  it("rejects a project from another company before writing a draft", async () => {
    await create(clientId, foreignProjectId)
    await processDueRecurringInvoices({ companyId })
    expect(await prisma.invoice.count({ where: { companyId } })).toBe(0)
  })
  it("rejects a project belonging to another client in the same company", async () => {
    await create(clientId, otherClientProjectId)
    await processDueRecurringInvoices({ companyId })
    expect(await prisma.invoice.count({ where: { companyId } })).toBe(0)
  })
  it("rejects an explicit audit author who is not a member of the company", async () => {
    await create()
    await processDueRecurringInvoices({ companyId, userId: foreignUserId })
    expect(await prisma.invoice.count({ where: { companyId } })).toBe(0)
  })
  it("keeps a coherent plan without a project supported", async () => {
    await create(clientId, null)
    expect(await processDueRecurringInvoices({ companyId })).toMatchObject({ generated: 1, failed: 0 })
    expect(await prisma.invoice.findFirst({ where: { companyId } })).toMatchObject({ projectId: null, clientId, status: "DRAFT" })
  })
  it("rejects a suspended preferred author without falling back to another member", async () => {
    await create()
    await prisma.membership.updateMany({ where: { companyId, userId }, data: { status: "SUSPENDED" } })
    expect(await processDueRecurringInvoices({ companyId, userId })).toMatchObject({ generated: 0, failed: 1 })
    expect(await prisma.invoice.count({ where: { companyId } })).toBe(0)
  })
  it("rejects a preferred author whose role is outside the worker author policy", async () => {
    await create()
    await prisma.membership.updateMany({ where: { companyId, userId }, data: { role: "SALES" } })
    expect(await processDueRecurringInvoices({ companyId, userId })).toMatchObject({ generated: 0, failed: 1 })
    expect(await prisma.invoice.count({ where: { companyId } })).toBe(0)
  })
  it("reports a nonexistent stored project without writing a partial occurrence", async () => {
    const recurring = await create(clientId, "fictional-missing-project")
    expect(await processDueRecurringInvoices({ companyId })).toMatchObject({ generated: 0, failed: 1 })
    expect(await prisma.invoice.count({ where: { companyId } })).toBe(0)
    expect(await prisma.recurringInvoiceOccurrence.count({ where: { recurringId: recurring.id } })).toBe(0)
    expect(await prisma.recurringInvoice.findUnique({ where: { id: recurring.id } })).toMatchObject({ isActive: true, nextGenDate: due, lastGenDate: null })
  })
  const maintenance = () => prisma.maintenanceContract.create({ data: { companyId, clientId, siteId, number: "FICTIONAL-WORKER", label: "Fictional maintenance", startDate: due, nextVisitAt: due } })
  it("preserves the shared author policy for coherent maintenance visits", async () => {
    await maintenance()
    expect(await processDueMaintenanceVisits({ companyId, userId })).toMatchObject({ scheduled: 1, failed: 0 })
    expect(await prisma.fieldIntervention.count({ where: { companyId } })).toBe(1)
  })
  it("rejects a foreign explicit author for maintenance without writing a visit", async () => {
    await maintenance()
    expect(await processDueMaintenanceVisits({ companyId, userId: foreignUserId })).toMatchObject({ scheduled: 0, failed: 1 })
    expect(await prisma.fieldIntervention.count({ where: { companyId } })).toBe(0)
  })
})
