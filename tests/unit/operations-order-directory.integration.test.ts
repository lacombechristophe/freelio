import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import prisma from "@/lib/prisma"
import { getCustomerOrderDirectory, getActiveReservationDirectory } from "@/actions/operations-orders"
import { consumeStockReservation, releaseStockReservation } from "@/actions/operations"

describe.sequential("Operations order directories on real SQL", () => {
  let membershipId: string, agencyId: string, otherAgencyId: string, foreignCompanyId: string
  let oldestOrderId: string, oldestReservationId: string, invoiceId: string
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional Operations directory" } })).id
    foreignCompanyId = (await prisma.company.create({ data: { name: "Foreign fictional directory" } })).id
    session.userId = (await prisma.user.create({ data: { email: `operations-directory-${randomUUID()}@example.test` } })).id
    membershipId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    agencyId = (await prisma.agency.create({ data: { companyId: session.companyId, code: "LOCAL", name: "Local directory agency" } })).id
    otherAgencyId = (await prisma.agency.create({ data: { companyId: session.companyId, code: "OTHER", name: "Other directory agency" } })).id
    await prisma.agencyMembership.create({ data: { membershipId, agencyId } })
    for (const [companyId, scopeAgency, amount] of [[session.companyId, agencyId, 151], [session.companyId, otherAgencyId, 1], [foreignCompanyId, null, 1]] as const) {
      const client = await prisma.client.create({ data: { companyId, name: "Directory client" } })
      const project = await prisma.project.create({ data: { companyId, clientId: client.id, agencyId: scopeAgency, name: "Directory project" } })
      const warehouse = await prisma.warehouse.create({ data: { companyId, agencyId: scopeAgency, code: scopeAgency === agencyId ? "LOCAL" : "OTHER", name: "Directory warehouse" } })
      const product = await prisma.product.create({ data: { companyId, sku: scopeAgency === agencyId ? "LOCAL" : "OTHER", label: "Directory product" } })
      await prisma.inventoryItem.create({ data: { companyId, warehouseId: warehouse.id, productId: product.id, quantity: amount, reservedQuantity: amount } })
      await prisma.customerOrder.createMany({ data: Array.from({ length: amount }, (_, index) => ({ companyId, clientId: client.id, projectId: project.id, number: `${scopeAgency === agencyId ? "DIRECTORY" : "OTHER"}-${String(index).padStart(3, "0")}`, createdAt: new Date(Date.UTC(2020, 0, 1, 0, index)), billingStatus: "INVOICED", totalTtcCents: 1200 })) })
      const orders = await prisma.customerOrder.findMany({ where: { companyId, projectId: project.id }, select: { id: true, number: true, createdAt: true } })
      await prisma.stockReservation.createMany({ data: orders.map(order => ({ companyId, warehouseId: warehouse.id, productId: product.id, projectId: project.id, customerOrderId: order.id, quantity: 1, createdAt: order.createdAt })) })
      if (scopeAgency === agencyId) {
        oldestOrderId = orders.find(order => order.number === "DIRECTORY-000")!.id
        oldestReservationId = (await prisma.stockReservation.findFirstOrThrow({ where: { companyId, customerOrderId: oldestOrderId }, select: { id: true } })).id
        invoiceId = (await prisma.invoice.create({ data: { companyId, clientId: client.id, projectId: project.id, customerOrderId: oldestOrderId, number: "DIRECTORY", object: "Fictional directory invoice", dueDate: new Date("2030-01-01"), status: "ISSUED", totalHtCents: 1000, totalTvaCents: 200, totalTtcCents: 1200 } })).id
      }
    }
  })
  afterEach(async () => {
    vi.unstubAllEnvs()
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OWNER" } })
    await prisma.stockReservation.update({ where: { id: oldestReservationId }, data: { status: "ACTIVE" } })
  })
  afterAll(async () => {
    for (const companyId of [session.companyId, foreignCompanyId]) {
      const where = { companyId }
      await prisma.invoice.deleteMany({ where })
      await prisma.stockReservation.deleteMany({ where })
      await prisma.inventoryItem.deleteMany({ where })
      await prisma.customerOrder.deleteMany({ where })
      await prisma.product.deleteMany({ where })
      await prisma.warehouse.deleteMany({ where })
      await prisma.project.deleteMany({ where })
      await prisma.client.deleteMany({ where })
      await prisma.company.delete({ where: { id: companyId } })
    }
    await prisma.user.delete({ where: { id: session.userId } })
  })
  for (const [name, load, oldestId] of [
    ["orders", getCustomerOrderDirectory, () => oldestOrderId],
    ["reservations", getActiveReservationDirectory, () => oldestReservationId],
  ] as const) {
    it(`${name}: pages through all 151 agency rows without overlaps`, async () => {
      const ids: string[] = []
      for (let page = 1; page <= 7; page++) {
        const result = await load({ agencyId, page })
        expect(result.total).toBe(151)
        expect(result.page).toBe(page)
        expect(result.items).toHaveLength(page === 7 ? 1 : 25)
        ids.push(...result.items.map(item => item.id))
      }
      expect(new Set(ids).size).toBe(151)
      expect(ids).toContain(oldestId())
    })
    it(`${name}: searches the oldest row before pagination`, async () => {
      const result = await load({ agencyId, search: "  DIRECTORY-000  ", page: 99 })
      expect(result).toMatchObject({ total: 1, page: 1 })
      expect(result.items.map(item => item.id)).toEqual([oldestId()])
    })
    it(`${name}: returns an empty first page for no matches`, async () => {
      expect(await load({ search: "missing reference", page: 999 })).toMatchObject({ total: 0, page: 1, items: [] })
    })
    it(`${name}: separates company and selected agency`, async () => {
      expect((await load()).total).toBe(152)
      expect((await load({ agencyId: otherAgencyId })).total).toBe(1)
    })
    it(`${name}: rejects an unassigned agency`, async () => {
      await prisma.membership.update({ where: { id: membershipId }, data: { role: "TECHNICIAN" } })
      expect((await load()).total).toBe(151)
      await expect(load({ agencyId: otherAgencyId })).rejects.toThrow("AGENCY_ACCESS_DENIED")
    })
    it(`${name}: reevaluates revoked access`, async () => {
      await prisma.membership.update({ where: { id: membershipId }, data: { role: "TECHNICIAN" } })
      await prisma.agencyMembership.deleteMany({ where: { membershipId, agencyId } })
      try { expect(await load()).toMatchObject({ total: 0, items: [] }) }
      finally { await prisma.agencyMembership.create({ data: { membershipId, agencyId } }) }
    })
    it(`${name}: validates the page and query bounds`, async () => {
      await expect(load({ page: 0 })).rejects.toThrow()
      await expect(load({ search: "x".repeat(201) })).rejects.toThrow()
    })
  }
  it("clamps the last reservation page after a release", async () => {
    await prisma.stockReservation.update({ where: { id: oldestReservationId }, data: { status: "RELEASED" } })
    const result = await getActiveReservationDirectory({ agencyId, page: 7 })
    expect(result).toMatchObject({ total: 150, page: 6 })
    expect(result.items).toHaveLength(25)
    expect(result.items.map(item => item.id)).not.toContain(oldestReservationId)
  })
  it("preserves Finance projection when the role changes", async () => {
    const query = { agencyId, search: "DIRECTORY-000" }
    expect((await getCustomerOrderDirectory(query)).items[0]).toMatchObject({ billingStatus: "INVOICED", invoices: [{ id: invoiceId }] })
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "TECHNICIAN" } })
    const result = await getCustomerOrderDirectory(query)
    expect(result).toMatchObject({ canBillOrders: false })
    expect(result.items[0]).toMatchObject({ billingStatus: null, invoices: [], totalTtcCents: 1200 })
  })
  it("allows Viewer reads and refuses stock mutations", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "VIEWER" } })
    expect(await getActiveReservationDirectory()).toMatchObject({ total: 151, canOperateStocks: false })
    expect((await getCustomerOrderDirectory()).canBillOrders).toBe(false)
    await expect(consumeStockReservation(oldestReservationId)).rejects.toThrow("droits nécessaires")
    await expect(releaseStockReservation(oldestReservationId)).rejects.toThrow("droits nécessaires")
  })
  it("offers stock commands to Operations without offering billing", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OPERATIONS" } })
    expect((await getActiveReservationDirectory()).canOperateStocks).toBe(true)
    expect((await getCustomerOrderDirectory()).canBillOrders).toBe(false)
  })
  it("keeps both lists readable without writes in the public demo", async () => {
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    expect(await getActiveReservationDirectory()).toMatchObject({ total: 152, canOperateStocks: false })
    expect(await getCustomerOrderDirectory()).toMatchObject({ total: 152, canBillOrders: false })
    await expect(releaseStockReservation(oldestReservationId)).rejects.toThrow("lecture seule")
  })
})
