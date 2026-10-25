import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import prisma from "@/lib/prisma"
import { getClientChoices } from "@/actions/clients/choices"
import { createCustomerSite, createServiceTicket, createMaintenanceContract, createCustomerOrder, getOperationsDashboard } from "@/actions/operations"
import { COMPANY_ROLES } from "@/lib/permissions"

describe.sequential("Operations complete client choices on real SQL", () => {
  let otherCompanyId: string, memberId: string, lastId: string, foreignId: string, siteId: string
  const kinds = ["site", "ticket", "maintenance", "order"] as const
  type Kind = typeof kinds[number]
  function create(kind: Kind, clientId: string) {
    if (kind === "site") return createCustomerSite({ clientId, label: "Fictional preserved site", address1: "12 rue fictive", postalCode: "75001", city: "Paris" })
    if (kind === "ticket") return createServiceTicket({ clientId, title: "Fictional preserved ticket", description: "Fictional preserved description", assignedMembershipId: memberId })
    if (kind === "maintenance") return createMaintenanceContract({ clientId, siteId, label: "Fictional preserved maintenance", startDate: "2030-01-02", priceCents: 12345, autoInvoice: false })
    return createCustomerOrder({ clientId, label: "Fictional preserved order", quantity: 2, unitPriceCents: 12345, tvaRate: 20, depositCents: 0 })
  }
  async function counts() {
    const where = { companyId: session.companyId }
    return Promise.all([prisma.customerSite.count({ where }), prisma.serviceTicket.count({ where }), prisma.maintenanceContract.count({ where }), prisma.customerOrder.count({ where }), prisma.auditLog.count({ where: { userId: session.userId } })])
  }
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional Operations complete client choices", isTvaApplicable: true } })).id
    otherCompanyId = (await prisma.company.create({ data: { name: "Foreign fictional Operations choice" } })).id
    session.userId = (await prisma.user.create({ data: { email: `operations-choice-${randomUUID()}@example.test` } })).id
    memberId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    await prisma.client.createMany({ data: Array.from({ length: 500 }, (_, index) => ({ companyId: session.companyId, name: `Client ${String(index).padStart(3, "0")}` })) })
    lastId = (await prisma.client.create({ data: { companyId: session.companyId, name: "ZZ DERNIER CLIENT" } })).id
    foreignId = (await prisma.client.create({ data: { companyId: otherCompanyId, name: "FOREIGN-OPERATIONS-CHOICE" } })).id
    siteId = (await prisma.customerSite.create({ data: { companyId: session.companyId, clientId: lastId, label: "Fictional last client site", address1: "12 rue fictive" } })).id
  })
  afterEach(async () => {
    vi.restoreAllMocks(); vi.unstubAllEnvs()
    await prisma.membership.update({ where: { id: memberId }, data: { role: "OWNER", status: "ACTIVE" } })
  })
  afterAll(async () => {
    const where = { companyId: { in: [session.companyId, otherCompanyId] } }
    await prisma.auditLog.deleteMany({ where: { userId: session.userId } })
    await prisma.customerOrder.deleteMany({ where }); await prisma.maintenanceContract.deleteMany({ where })
    await prisma.serviceTicket.deleteMany({ where }); await prisma.customerSite.deleteMany({ where })
    await prisma.client.deleteMany({ where }); await prisma.company.deleteMany({ where: { id: { in: [session.companyId, otherCompanyId] } } })
    await prisma.user.deleteMany({ where: { id: session.userId } })
  })
  it("reaches all 501 clients by stable pages and keeps the last selection outside the page", async () => {
    const ids: string[] = []
    for (let page = 1; page <= 21; page++) {
      const result = await getClientChoices({ page, selectedId: lastId })
      expect(result).toMatchObject({ total: 501, page, selected: { id: lastId, name: "ZZ DERNIER CLIENT" } })
      expect(result.items).toHaveLength(page === 21 ? 1 : 25)
      ids.push(...result.items.map(row => row.id))
    }
    expect(new Set(ids).size).toBe(501); expect(ids.at(-1)).toBe(lastId)
    expect(await getClientChoices({ search: "dernier", page: 100, selectedId: lastId })).toMatchObject({ total: 1, page: 1, items: [{ id: lastId }] })
  })
  it.each(COMPANY_ROLES)("preserves company-shared minimal choices for %s", async role => {
    await prisma.membership.update({ where: { id: memberId }, data: { role } })
    const result = await getClientChoices({ selectedId: lastId })
    expect(result.total).toBe(501)
    for (const row of [...result.items, result.selected!]) expect(Object.keys(row).sort()).toEqual(["id", "name"])
    expect(await getClientChoices({ search: "FOREIGN", selectedId: foreignId })).toEqual({ total: 0, page: 1, items: [], selected: null })
  })
  it("omits the unused bounded client payload from the Operations dashboard", async () => {
    expect(Object.hasOwn(await getOperationsDashboard(), "clients")).toBe(false)
  })
  it.each(kinds)("creates %s with the 501st company client and retains its business fields", async kind => {
    await create(kind, lastId)
    if (kind === "site") expect(await prisma.customerSite.findFirst({ where: { companyId: session.companyId, label: "Fictional preserved site" } })).toMatchObject({ clientId: lastId, address1: "12 rue fictive", postalCode: "75001", city: "Paris" })
    if (kind === "ticket") expect(await prisma.serviceTicket.findFirst({ where: { companyId: session.companyId } })).toMatchObject({ clientId: lastId, description: "Fictional preserved description", assignedMembershipId: memberId })
    if (kind === "maintenance") expect(await prisma.maintenanceContract.findFirst({ where: { companyId: session.companyId } })).toMatchObject({ clientId: lastId, siteId, priceCents: 12345, autoInvoice: false })
    if (kind === "order") expect(await prisma.customerOrder.findFirst({ where: { companyId: session.companyId } })).toMatchObject({ clientId: lastId, totalHtCents: 24690, totalTtcCents: 29628 })
  })
  it.each(kinds)("rejects a foreign client for %s before mutation or audit", async kind => {
    const before = await counts()
    await expect(create(kind, foreignId)).rejects.toThrow("Client introuvable")
    expect(await counts()).toEqual(before)
  })
  it.each(kinds)("keeps %s writes denied to Viewer before reading the selected client", async kind => {
    await prisma.membership.update({ where: { id: memberId }, data: { role: "VIEWER" } })
    const before = await counts(), read = vi.spyOn(prisma.client, "findFirst")
    await expect(create(kind, lastId)).rejects.toThrow()
    expect(read).not.toHaveBeenCalled(); expect(await counts()).toEqual(before)
  })
  it.each(kinds)("keeps %s writes forbidden in public read-only demo", async kind => {
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    expect((await getClientChoices({ selectedId: lastId })).selected?.id).toBe(lastId)
    const before = await counts()
    await expect(create(kind, lastId)).rejects.toThrow()
    expect(await counts()).toEqual(before)
  })
  it("offers a replacement after a selected client disappears", async () => {
    const removed = await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional removable choice" } })
    await prisma.client.delete({ where: { id: removed.id } })
    expect(await getClientChoices({ selectedId: removed.id, search: "dernier" })).toMatchObject({ total: 1, selected: null, items: [{ id: lastId }] })
  })
  it("rejects revoked membership before any directory query", async () => {
    await prisma.membership.update({ where: { id: memberId }, data: { status: "INACTIVE" } })
    const read = vi.spyOn(prisma.client, "count")
    await expect(getClientChoices()).rejects.toThrow("plus accès")
    expect(read).not.toHaveBeenCalled()
  })
})
