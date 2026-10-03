import { afterAll, describe, expect, it, vi } from "vitest"
import type { Permission } from "@/lib/permissions"

vi.mock("server-only", () => ({}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/audit", () => ({ logAction: vi.fn() }))
const actor = vi.hoisted(() => ({ companyId: "", userId: "fixture", membershipId: "fixture", role: "OWNER" as "OWNER" | "SERVICE", agencyIds: null as null | string[] }))
const failure = vi.hoisted(() => ({ calls: 0, at: Infinity }))
vi.mock("@/lib/auth-wrapper", async () => {
  const { requestContext } = await import("@/lib/context")
  return { AuthorizationError: class extends Error {}, withAuth: (task: (context: typeof actor) => Promise<unknown>, permission: Permission) => requestContext.run({ ...actor, actionPermission: permission }, () => task(actor)) }
})
vi.mock("@/lib/automations/engine", async () => {
  const actual = await vi.importActual<typeof import("@/lib/automations/engine")>("@/lib/automations/engine")
  return { ...actual, dispatchAutomationEvent: vi.fn(async () => ({ workflows: 0, completed: 0 })),
    enqueueAutomationEvent: async (...args: Parameters<typeof actual.enqueueAutomationEvent>) => {
      if (++failure.calls === failure.at) throw new Error("Injected later-batch failure")
      return actual.enqueueAutomationEvent(...args)
    },
  }
})

import prisma from "@/lib/prisma"
import { getCustomerSuccessWorkspace, recomputeCustomerHealth } from "@/actions/customer-success"
import { loadCustomerHealthMetrics } from "@/lib/operations/customer-health-metrics"

describe.sequential("complete customer-success portfolio on SQL", () => {
  const companies: string[] = []
  afterAll(async () => {
    const where = { companyId: { in: companies } }
    await prisma.serviceTicket.deleteMany({ where })
    await prisma.invoice.deleteMany({ where })
    await prisma.maintenanceContract.deleteMany({ where })
    await prisma.customerSite.deleteMany({ where })
    await prisma.client.deleteMany({ where })
    await prisma.company.deleteMany({ where: { id: { in: companies } } })
    await prisma.processorLease.deleteMany({ where: { name: { in: companies.map((id) => `customer-health:${id}`) } } })
  })
  async function fixture(count = 1) {
    const company = await prisma.company.create({ data: { name: "Fictitious full portfolio" } })
    companies.push(company.id)
    actor.companyId = company.id; actor.role = "OWNER"; actor.agencyIds = null; failure.calls = 0; failure.at = Infinity
    for (let offset = 0; offset < count; offset += 200) await prisma.client.createMany({ data: Array.from({ length: Math.min(200, count - offset) }, (_, index) => ({
      id: `${company.id}-${String(offset + index).padStart(5, "0")}`, companyId: company.id,
      name: `Fiction ${String(offset + index).padStart(5, "0")}`, createdAt: new Date("2020-01-01"),
    })) })
    return { companyId: company.id, clientId: `${company.id}-00000` }
  }
  async function riskRule(companyId: string) {
    await prisma.customerHealthRule.create({ data: { companyId, name: "Inactive fixture", metric: "DAYS_SINCE_ACTIVITY", operator: "GTE", threshold: 1, impact: -60 } })
  }

  it("searches, prioritizes and pages all 1001 clients with full-company counters and stable ties", async () => {
    const { companyId } = await fixture(1001)
    await riskRule(companyId)
    const foreign = await prisma.company.create({ data: { name: "Foreign fiction" } }); companies.push(foreign.id)
    await prisma.client.create({ data: { companyId: foreign.id, name: "Fiction 01000" } })
    const first = await getCustomerSuccessWorkspace()
    expect(first.portfolio).toHaveLength(25)
    expect(first.total).toBe(1001)
    expect(first.metrics).toEqual({ healthy: 0, watch: 0, risk: 1001, renewals90Days: 0 })
    const last = await getCustomerSuccessWorkspace({ page: 100_000 })
    expect(last.page).toBe(41)
    expect(last.portfolio.map((client) => client.id)).toEqual([`${companyId}-01000`])
    const found = await getCustomerSuccessWorkspace({ search: " fiction 01000 ", status: "RISK", page: 3 })
    expect(found.total).toBe(1)
    expect(found.totalClients).toBe(1001)
    expect(found.metrics.risk).toBe(1001)
    expect(found.portfolio[0].id).toBe(`${companyId}-01000`)
    const healthy = await getCustomerSuccessWorkspace({ status: "HEALTHY" })
    expect(healthy.portfolio).toEqual([])
    expect(healthy.metrics.risk).toBe(1001)
    const second = await getCustomerSuccessWorkspace({ page: 2 })
    expect(second.portfolio[0].id).toBe(`${companyId}-00025`)
  }, 120_000)

  it("aggregates more than 500 tickets/invoices and 100 contracts/responses without sampling", async () => {
    const { companyId, clientId } = await fixture()
    const now = new Date("2026-10-03T12:00:00Z"), yesterday = new Date(now.getTime() - 86_400_000)
    await prisma.serviceTicket.createMany({ data: Array.from({ length: 501 }, (_, index) => ({ companyId, clientId, number: `T-${index}`, title: "Fixture", description: "Fiction", dueAt: yesterday, requestedAt: yesterday })) })
    await prisma.serviceTicket.create({ data: { companyId, clientId, number: "MERGED", title: "Merged", description: "Fiction", status: "MERGED", dueAt: yesterday } })
    const invoice = { companyId, clientId, object: "Fiction", status: "ISSUED", dueDate: yesterday, date: yesterday, totalHtCents: 100, totalTvaCents: 0, totalTtcCents: 100, paidAmountCents: 20 }
    await prisma.invoice.createMany({ data: Array.from({ length: 501 }, (_, index) => ({ ...invoice, number: `I-${index}` })) })
    await prisma.invoice.createMany({ data: [
      { ...invoice, number: "overpaid", paidAmountCents: 10_000 },
      ...["DRAFT", "PAID", "CANCELED"].map((status) => ({ ...invoice, number: status, status })),
      { ...invoice, number: "credit", type: "CREDIT_NOTE" },
      { ...invoice, number: "future", dueDate: new Date("2027-01-01") },
    ] })
    const site = await prisma.customerSite.create({ data: { companyId, clientId, label: "Fiction site", address1: "Fictitious address" } })
    await prisma.maintenanceContract.createMany({ data: Array.from({ length: 101 }, (_, index) => ({ companyId, clientId, siteId: site.id, number: `C-${index}`, label: "Fiction", startDate: yesterday, endDate: index === 100 ? new Date("2026-10-13T12:00:00Z") : null })) })
    const survey = await prisma.satisfactionSurvey.create({ data: { companyId, name: "Five-point fiction", question: "Fiction?" } })
    const secondScale = await prisma.satisfactionSurvey.create({ data: { companyId, name: "Ten-point fiction", question: "Fiction?", scaleMin: 0, scaleMax: 10 } })
    await prisma.satisfactionRequest.createMany({ data: Array.from({ length: 101 }, (_, index) => ({ companyId, clientId, surveyId: survey.id, tokenHash: `${companyId}-${index}`, expiresAt: now, respondedAt: yesterday, score: index < 100 ? 5 : 1 })) })
    await prisma.satisfactionRequest.create({ data: { companyId, clientId, surveyId: secondScale.id, tokenHash: `${companyId}-second`, expiresAt: now, respondedAt: yesterday, score: 0 } })
    const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId } })
    const result = (await loadCustomerHealthMetrics(prisma, companyId, [client], now)).get(clientId)!
    expect(result.metrics).toEqual({ OPEN_TICKETS: 501, OVERDUE_TICKETS: 501, TICKETS_90D: 501, ACTIVE_CONTRACTS: 101,
      OVERDUE_BALANCE_CENTS: 40_080, DAYS_SINCE_ACTIVITY: 1, DAYS_TO_RENEWAL: 10, SATISFACTION_PERCENT: 98 })
    await prisma.client.update({ where: { id: clientId }, data: { renewalAt: new Date("2026-10-23T12:00:00Z") } })
    const override = await prisma.client.findUniqueOrThrow({ where: { id: clientId } })
    expect((await loadCustomerHealthMetrics(prisma, companyId, [override], now)).get(clientId)!.metrics.DAYS_TO_RENEWAL).toBe(20)
  }, 120_000)

  it("recomputes every client once, retaining durable events and avoiding duplicate snapshots", async () => {
    const { companyId } = await fixture(1001)
    await riskRule(companyId)
    expect((await recomputeCustomerHealth()).clients).toBe(1001)
    expect(await prisma.client.count({ where: { companyId, relationScore: 40 } })).toBe(1001)
    expect(await prisma.customerHealthSnapshot.count({ where: { companyId } })).toBe(1001)
    expect(await prisma.automationEventOutbox.count({ where: { companyId } })).toBe(1001)
    await recomputeCustomerHealth()
    expect(await prisma.customerHealthSnapshot.count({ where: { companyId } })).toBe(1001)
    expect(await prisma.automationEventOutbox.count({ where: { companyId } })).toBe(1001)
  }, 120_000)

  it("keeps agency-restricted ticket signals scoped while reading the company portfolio", async () => {
    const { companyId, clientId } = await fixture()
    const agency = await prisma.agency.create({ data: { companyId, code: "VISIBLE", name: "Visible fiction" } })
    const hidden = await prisma.agency.create({ data: { companyId, code: "HIDDEN", name: "Hidden fiction" } })
    for (const agencyId of [agency.id, hidden.id]) {
      const site = await prisma.customerSite.create({ data: { companyId, clientId, agencyId, label: "Fiction site", address1: "Fictitious address" } })
      await prisma.serviceTicket.create({ data: { companyId, clientId, siteId: site.id, number: agencyId, title: "Fiction", description: "Fiction", requestedAt: new Date(Date.now() - 86_400_000), dueAt: new Date(Date.now() - 86_400_000) } })
    }
    actor.role = "SERVICE"; actor.agencyIds = [agency.id]
    const scoped = await getCustomerSuccessWorkspace()
    expect(scoped.totalClients).toBe(1)
    expect(scoped.portfolio[0].metrics.OPEN_TICKETS).toBe(1)
    expect(scoped.portfolio[0].metrics.OVERDUE_TICKETS).toBe(1)
    actor.agencyIds = []
    expect((await getCustomerSuccessWorkspace()).portfolio[0].metrics.OPEN_TICKETS).toBe(0)
    await expect(recomputeCustomerHealth()).rejects.toThrow("administrateur")
    actor.role = "OWNER"; actor.agencyIds = null
  })

  it("keeps a daily snapshot even when the previous recalculation was recent", async () => {
    const { companyId, clientId } = await fixture()
    await prisma.client.update({ where: { id: clientId }, data: { healthLastComputedAt: new Date() } })
    await prisma.customerHealthSnapshot.create({ data: { companyId, clientId, score: 100, status: "HEALTHY", factors: [], computedAt: new Date(Date.now() - 25 * 3_600_000) } })
    await recomputeCustomerHealth()
    expect(await prisma.customerHealthSnapshot.count({ where: { companyId } })).toBe(2)
  })

  it("rolls back all scores, snapshots and events when the second batch fails", async () => {
    const { companyId } = await fixture(201)
    await riskRule(companyId)
    failure.at = 201
    await expect(recomputeCustomerHealth()).rejects.toThrow("Injected later-batch failure")
    expect(await prisma.client.count({ where: { companyId, relationScore: 100, healthLastComputedAt: null } })).toBe(201)
    expect(await prisma.customerHealthSnapshot.count({ where: { companyId } })).toBe(0)
    expect(await prisma.automationEventOutbox.count({ where: { companyId } })).toBe(0)
    failure.at = Infinity
  }, 120_000)

  it("rejects overlapping recalculations and agency-limited global writes", async () => {
    const { companyId } = await fixture()
    await prisma.processorLease.create({ data: { name: `customer-health:${companyId}`, ownerId: "other", leaseUntil: new Date(Date.now() + 60_000) } })
    await expect(recomputeCustomerHealth()).rejects.toThrow("déjà en cours")
    actor.agencyIds = []
    await expect(recomputeCustomerHealth()).rejects.toThrow("administrateur")
    actor.agencyIds = null
    expect(await prisma.customerHealthSnapshot.count({ where: { companyId } })).toBe(0)
  })
})
