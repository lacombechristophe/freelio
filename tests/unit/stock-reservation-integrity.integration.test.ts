import { createDatabaseClient } from "@/lib/database-client"
import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
const fault = vi.hoisted(() => ({ serialization: false }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/prisma", async importOriginal => {
  const prismaModule = await importOriginal<typeof import("@/lib/prisma")>()
  const real = prismaModule.default, transaction = real.$transaction.bind(real)
  return { ...prismaModule, default: new Proxy(real, { get(target, key) {
    if (key === "$transaction") return (...args: unknown[]) => {
      if (fault.serialization) { fault.serialization = false; return Promise.reject({ code: "P2034" }) }
      return Reflect.apply(transaction, real, args)
    }
    return Reflect.get(target, key)
  } }) }
})
import prisma from "@/lib/prisma"
import { consumeStockReservation, releaseStockReservation, reserveStock } from "@/actions/operations"

const db = createDatabaseClient()
const sqlite = process.env.DATABASE_URL?.startsWith("file:")

describe.sequential("Stock reservation integrity on real SQL", () => {
  let foreignCompanyId: string, foreignClientId: string, clientId: string, membershipId: string
  let warehouseId: string, productId: string, projectId: string, orderId: string, foreignSupplierId: string
  beforeAll(async () => {
    session.companyId = (await db.company.create({ data: { name: "Fictional reservation integrity" } })).id
    foreignCompanyId = (await db.company.create({ data: { name: "Foreign fictional reservation integrity" } })).id
    session.userId = (await db.user.create({ data: { email: `stock-integrity-${randomUUID()}@example.test` } })).id
    membershipId = (await db.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    clientId = (await db.client.create({ data: { companyId: session.companyId, name: "Local fictional stock client" } })).id
    foreignClientId = (await db.client.create({ data: { companyId: foreignCompanyId, name: "Foreign fictional stock client" } })).id
    foreignSupplierId = (await db.supplier.create({ data: { companyId: foreignCompanyId, name: "Foreign fictional supplier" } })).id
    projectId = (await db.project.create({ data: { companyId: session.companyId, clientId, name: "Fictional stock project" } })).id
    orderId = (await db.customerOrder.create({ data: { companyId: session.companyId, clientId, projectId, number: "STOCK-INTEGRITY", status: "CONFIRMED" } })).id
    warehouseId = (await db.warehouse.create({ data: { companyId: session.companyId, code: "INTEGRITY", name: "Fictional stock warehouse" } })).id
    productId = (await db.product.create({ data: { companyId: session.companyId, sku: "INTEGRITY", label: "Fictional stock product" } })).id
    await db.inventoryItem.create({ data: { companyId: session.companyId, warehouseId, productId, quantity: 10 } })
  })
  async function dropAuditFailure() {
    await db.$executeRawUnsafe(sqlite ? 'DROP TRIGGER IF EXISTS "fictional_reservation_audit"' : 'DROP TRIGGER IF EXISTS fictional_reservation_audit ON "AuditLog"')
    if (!sqlite) await db.$executeRawUnsafe('DROP FUNCTION IF EXISTS fictional_reservation_audit()')
  }
  afterEach(async () => {
    vi.restoreAllMocks(); vi.unstubAllEnvs()
    fault.serialization = false
    await dropAuditFailure()
    await db.stockMovement.deleteMany({ where: { companyId: session.companyId } })
    await db.stockReservation.deleteMany({ where: { companyId: session.companyId } })
    await db.inventoryItem.updateMany({ where: { companyId: session.companyId }, data: { quantity: 10, reservedQuantity: 0 } })
    await db.product.update({ where: { id: productId }, data: { active: true, supplierId: null } })
    await db.project.update({ where: { id: projectId }, data: { clientId, siteId: null, status: "ACTIVE" } })
    await db.customerOrder.update({ where: { id: orderId }, data: { clientId, projectId, status: "CONFIRMED" } })
    await db.membership.update({ where: { id: membershipId }, data: { role: "OWNER" } })
    await db.auditLog.deleteMany({ where: { userId: session.userId } })
  })
  afterAll(async () => {
    await db.inventoryItem.deleteMany({ where: { companyId: session.companyId } })
    await db.customerOrder.deleteMany({ where: { companyId: session.companyId } })
    await db.project.deleteMany({ where: { companyId: session.companyId } })
    await db.warehouse.deleteMany({ where: { companyId: session.companyId } })
    await db.product.deleteMany({ where: { companyId: session.companyId } })
    await db.client.deleteMany({ where: { companyId: { in: [session.companyId, foreignCompanyId] } } })
    await db.company.deleteMany({ where: { id: { in: [session.companyId, foreignCompanyId] } } })
    await db.user.delete({ where: { id: session.userId } }); await db.$disconnect()
  })
  function reserve() { return reserveStock({ warehouseId, productId, projectId, customerOrderId: orderId, quantity: 2 }) }
  async function snapshot() {
    return Promise.all([
      db.inventoryItem.findMany({ where: { companyId: session.companyId }, orderBy: { id: "asc" } }),
      db.stockReservation.findMany({ where: { companyId: session.companyId }, orderBy: { id: "asc" } }),
      db.stockMovement.findMany({ where: { companyId: session.companyId }, orderBy: { id: "asc" } }),
      db.auditLog.findMany({ where: { userId: session.userId }, orderBy: { id: "asc" } }),
    ])
  }
  async function auditFailure(action: string) {
    if (sqlite) await db.$executeRawUnsafe(`CREATE TRIGGER "fictional_reservation_audit" BEFORE INSERT ON "AuditLog" WHEN NEW."action" = '${action}' BEGIN SELECT RAISE(ABORT, 'Fictional reservation audit failure'); END`)
    else {
      await db.$executeRawUnsafe(`CREATE FUNCTION fictional_reservation_audit() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'Fictional reservation audit failure'; END; $$ LANGUAGE plpgsql`)
      await db.$executeRawUnsafe(`CREATE TRIGGER fictional_reservation_audit BEFORE INSERT ON "AuditLog" FOR EACH ROW WHEN (NEW."action" = '${action}') EXECUTE FUNCTION fictional_reservation_audit()`)
    }
  }
  it("rechecks product activity after preparation without a stock write", async () => {
    const original = prisma.product.findFirst.bind(prisma.product)
    const delegate: { findFirst(args: Parameters<typeof original>[0]): Promise<Awaited<ReturnType<typeof original>>> } = prisma.product
    vi.spyOn(delegate, "findFirst").mockImplementationOnce(async args => {
      const row = await original(args); await db.product.update({ where: { id: productId }, data: { active: false } }); return row
    })
    const before = await snapshot()
    await expect(reserve()).rejects.toThrow("introuvable")
    expect(await snapshot()).toEqual(before)
    expect((await db.product.findUniqueOrThrow({ where: { id: productId } })).active).toBe(false)
  })
  it("refuses a product belonging to a supplier of another company", async () => {
    await db.product.update({ where: { id: productId }, data: { supplierId: foreignSupplierId } })
    const before = await snapshot()
    await expect(reserve()).rejects.toThrow("introuvable")
    expect(await snapshot()).toEqual(before)
  })
  for (const operation of ["reserve", "release", "consume"] as const) {
    it(`rechecks the project client after preparation during ${operation}`, async () => {
      const existing = operation === "reserve" ? null : await reserve()
      const original = prisma.project.findFirst.bind(prisma.project)
      const delegate: { findFirst(args: Parameters<typeof original>[0]): Promise<Awaited<ReturnType<typeof original>>> } = prisma.project
      vi.spyOn(delegate, "findFirst").mockImplementationOnce(async args => {
        const row = await original(args); await db.project.update({ where: { id: projectId }, data: { clientId: foreignClientId } }); return row
      })
      const before = await snapshot()
      await expect(operation === "reserve" ? reserve() : operation === "release" ? releaseStockReservation(existing!.id) : consumeStockReservation(existing!.id)).rejects.toThrow("introuvable")
      expect(await snapshot()).toEqual(before)
      expect((await db.project.findUniqueOrThrow({ where: { id: projectId } })).clientId).toBe(foreignClientId)
    })
  }
  it("rechecks an order changed to a foreign client after preparation", async () => {
    const original = prisma.customerOrder.findFirst.bind(prisma.customerOrder)
    const delegate: { findFirst(args: Parameters<typeof original>[0]): Promise<Awaited<ReturnType<typeof original>>> } = prisma.customerOrder
    vi.spyOn(delegate, "findFirst").mockImplementationOnce(async args => {
      const row = await original(args); await db.customerOrder.update({ where: { id: orderId }, data: { clientId: foreignClientId } }); return row
    })
    const before = await snapshot()
    await expect(reserve()).rejects.toThrow("introuvable")
    expect(await snapshot()).toEqual(before)
    expect((await db.customerOrder.findUniqueOrThrow({ where: { id: orderId } })).clientId).toBe(foreignClientId)
  })
  for (const [operation, action] of [["reserve", "CREATE_STOCK_RESERVATION"], ["release", "RELEASE_STOCK_RESERVATION"], ["consume", "CONSUME_STOCK_RESERVATION"]] as const) {
    it(`keeps ${operation}, quantities and movement atomic with audit`, async () => {
      const existing = operation === "reserve" ? null : await reserve()
      const before = await snapshot()
      await auditFailure(action)
      await expect(operation === "reserve" ? reserve() : operation === "release" ? releaseStockReservation(existing!.id) : consumeStockReservation(existing!.id)).rejects.toThrow()
      expect(await snapshot()).toEqual(before)
      expect((await db.customerOrder.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("CONFIRMED")
    })
  }
  for (const operation of ["release", "consume"] as const) {
    it(`rejects a changed reservation quantity even when its timestamp is retained during ${operation}`, async () => {
      const existing = await reserve()
      const original = prisma.stockReservation.findFirst.bind(prisma.stockReservation)
      const delegate: { findFirst(args: Parameters<typeof original>[0]): Promise<Awaited<ReturnType<typeof original>>> } = prisma.stockReservation
      vi.spyOn(delegate, "findFirst").mockImplementationOnce(async args => {
        const row = await original(args)
        await db.stockReservation.update({ where: { id: existing.id }, data: { quantity: 3, updatedAt: row!.updatedAt } })
        await db.inventoryItem.update({ where: { warehouseId_productId: { warehouseId, productId } }, data: { reservedQuantity: 3 } })
        return row
      })
      await expect((operation === "release" ? releaseStockReservation : consumeStockReservation)(existing.id)).rejects.toThrow("Réservation active introuvable")
      expect(await db.inventoryItem.findUniqueOrThrow({ where: { warehouseId_productId: { warehouseId, productId } } })).toMatchObject({ quantity: 10, reservedQuantity: 3 })
      expect(await db.stockReservation.findUniqueOrThrow({ where: { id: existing.id } })).toMatchObject({ quantity: 3, status: "ACTIVE" })
      expect(await db.stockMovement.count({ where: { companyId: session.companyId } })).toBe(1)
      expect(await db.auditLog.count({ where: { userId: session.userId } })).toBe(1)
    })
    it(`rejects a foreign supplier attached after allocation during ${operation}`, async () => {
      const existing = await reserve()
      await db.product.update({ where: { id: productId }, data: { supplierId: foreignSupplierId } })
      const before = await snapshot()
      await expect((operation === "release" ? releaseStockReservation : consumeStockReservation)(existing.id)).rejects.toThrow("Réservation active introuvable")
      expect(await snapshot()).toEqual(before)
    })
  }
  for (const operation of ["reserve", "release", "consume"] as const) {
    it(`classifies a simulated serialization conflict during ${operation} without a stock write`, async () => {
      const existing = operation === "reserve" ? null : await reserve()
      const before = await snapshot()
      fault.serialization = true
      await expect(operation === "reserve" ? reserve() : operation === "release" ? releaseStockReservation(existing!.id) : consumeStockReservation(existing!.id)).rejects.toThrow("Le stock a changé")
      expect(await snapshot()).toEqual(before)
    })
  }
  it("does not add a second terminal audit after a replay", async () => {
    const existing = await reserve(); await consumeStockReservation(existing.id)
    const before = await snapshot()
    await expect(releaseStockReservation(existing.id)).rejects.toThrow("Réservation active introuvable")
    await expect(consumeStockReservation(existing.id)).rejects.toThrow("Réservation active introuvable")
    expect(await snapshot()).toEqual(before)
    expect(await db.auditLog.count({ where: { resourceId: existing.id } })).toBe(2)
  })
  it("preserves a coherent reserve/release/consume cycle and its four audits", async () => {
    const first = await reserve(); await releaseStockReservation(first.id)
    const second = await reserve(); await consumeStockReservation(second.id)
    expect(await db.inventoryItem.findUniqueOrThrow({ where: { warehouseId_productId: { warehouseId, productId } } })).toMatchObject({ quantity: 8, reservedQuantity: 0 })
    expect(await db.stockMovement.count({ where: { companyId: session.companyId } })).toBe(4)
    expect((await db.auditLog.findMany({ where: { userId: session.userId } })).map(row => row.action).sort()).toEqual(["CREATE_STOCK_RESERVATION", "CREATE_STOCK_RESERVATION", "RELEASE_STOCK_RESERVATION", "CONSUME_STOCK_RESERVATION"].sort())
  })
})
