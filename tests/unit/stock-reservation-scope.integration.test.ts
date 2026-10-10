import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import prisma from "@/lib/prisma"
import { consumeStockReservation, releaseStockReservation, reserveStock } from "@/actions/operations"

describe.sequential("stock reservations reject inconsistent customer references on SQL", () => {
  let foreignCompanyId: string, projectId: string, invalidProjectId: string, otherProjectId: string, orderId: string, invalidOrderId: string, warehouseId: string, productId: string
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional stock scope company" } })).id
    foreignCompanyId = (await prisma.company.create({ data: { name: "Fictional foreign stock scope" } })).id
    session.userId = (await prisma.user.create({ data: { email: `stock-scope-${randomUUID()}@example.test` } })).id
    await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })
    const client = await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional local stock client" } })
    const foreign = await prisma.client.create({ data: { companyId: foreignCompanyId, name: "Fictional foreign stock client" } })
    projectId = (await prisma.project.create({ data: { companyId: session.companyId, clientId: client.id, name: "Fictional stock project" } })).id
    invalidProjectId = (await prisma.project.create({ data: { companyId: session.companyId, clientId: foreign.id, name: "Fictional inconsistent stock project" } })).id
    const otherClient = await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional different stock client" } })
    otherProjectId = (await prisma.project.create({ data: { companyId: session.companyId, clientId: otherClient.id, name: "Fictional other client project" } })).id
    orderId = (await prisma.customerOrder.create({ data: { companyId: session.companyId, clientId: client.id, projectId, number: "COHERENT", status: "CONFIRMED" } })).id
    invalidOrderId = (await prisma.customerOrder.create({ data: { companyId: session.companyId, clientId: foreign.id, projectId: invalidProjectId, number: "INCONSISTENT", status: "CONFIRMED" } })).id
    warehouseId = (await prisma.warehouse.create({ data: { companyId: session.companyId, code: "LOCAL", name: "Fictional stock warehouse" } })).id
    productId = (await prisma.product.create({ data: { companyId: session.companyId, sku: "LOCAL", label: "Fictional stock product" } })).id
    await prisma.inventoryItem.create({ data: { companyId: session.companyId, warehouseId, productId, quantity: 10 } })
  })
  afterEach(async () => {
    await prisma.stockMovement.deleteMany({ where: { companyId: session.companyId } })
    await prisma.stockReservation.deleteMany({ where: { companyId: session.companyId } })
    await prisma.inventoryItem.updateMany({ where: { companyId: session.companyId }, data: { quantity: 10, reservedQuantity: 0 } })
    await prisma.customerOrder.updateMany({ where: { companyId: session.companyId }, data: { status: "CONFIRMED" } })
    await prisma.customerOrder.update({ where: { id: orderId }, data: { projectId } })
    await prisma.auditLog.deleteMany({ where: { userId: session.userId } })
  })
  afterAll(async () => {
    await prisma.inventoryItem.deleteMany({ where: { companyId: session.companyId } })
    await prisma.warehouse.deleteMany({ where: { companyId: session.companyId } })
    await prisma.product.deleteMany({ where: { companyId: session.companyId } })
    await prisma.customerOrder.deleteMany({ where: { companyId: session.companyId } })
    await prisma.project.deleteMany({ where: { companyId: session.companyId } })
    await prisma.client.deleteMany({ where: { companyId: { in: [session.companyId, foreignCompanyId] } } })
    await prisma.company.deleteMany({ where: { id: { in: [session.companyId, foreignCompanyId] } } })
    await prisma.user.delete({ where: { id: session.userId } })
  })
  async function balance() { return prisma.inventoryItem.findUniqueOrThrow({ where: { warehouseId_productId: { warehouseId, productId } } }) }
  it.each(["project", "order"])("refuses a new reservation through an inconsistent %s", async kind => {
    await expect(reserveStock({ warehouseId, productId, quantity: 2, ...(kind === "project" ? { projectId: invalidProjectId } : { customerOrderId: invalidOrderId }) })).rejects.toThrow("introuvable")
    expect(await balance()).toMatchObject({ quantity: 10, reservedQuantity: 0 })
    expect(await prisma.stockReservation.count({ where: { companyId: session.companyId } })).toBe(0)
    expect(await prisma.stockMovement.count({ where: { companyId: session.companyId } })).toBe(0)
  })
  it.each([
    ["project", "release", releaseStockReservation], ["project", "consume", consumeStockReservation],
    ["order", "release", releaseStockReservation], ["order", "consume", consumeStockReservation],
  ] as const)("refuses an inconsistent stored %s reference during %s", async (kind, _operation, action) => {
    const reservation = await prisma.stockReservation.create({ data: { companyId: session.companyId, warehouseId, productId, quantity: 2, ...(kind === "project" ? { projectId: invalidProjectId } : { customerOrderId: invalidOrderId }) } })
    await prisma.inventoryItem.updateMany({ where: { companyId: session.companyId }, data: { reservedQuantity: 2 } })
    await expect(action(reservation.id)).rejects.toThrow("Réservation active introuvable")
    expect(await balance()).toMatchObject({ quantity: 10, reservedQuantity: 2 })
    expect(await prisma.stockReservation.findUniqueOrThrow({ where: { id: reservation.id } })).toMatchObject({ status: "ACTIVE", updatedAt: reservation.updatedAt })
    expect(await prisma.stockMovement.count({ where: { companyId: session.companyId } })).toBe(0)
    expect(await prisma.customerOrder.findUniqueOrThrow({ where: { id: invalidOrderId } })).toMatchObject({ status: "CONFIRMED" })
  })
  it.each(["project", "order"])("preserves a coherent %s reservation, release and consumption", async kind => {
    const data = { warehouseId, productId, quantity: 2, ...(kind === "project" ? { projectId } : { customerOrderId: orderId }) }
    const released = await reserveStock(data)
    await releaseStockReservation(released.id)
    const consumed = await reserveStock(data)
    await consumeStockReservation(consumed.id)
    expect(await balance()).toMatchObject({ quantity: 8, reservedQuantity: 0 })
    expect(await prisma.stockMovement.count({ where: { companyId: session.companyId } })).toBe(4)
    expect(await prisma.customerOrder.findUniqueOrThrow({ where: { id: orderId } })).toMatchObject({ status: kind === "order" ? "IN_PREPARATION" : "CONFIRMED" })
  })
  it.each(["create", "release", "consume"])("refuses a local order with a different client's project during %s", async operation => {
    await prisma.customerOrder.update({ where: { id: orderId }, data: { projectId: otherProjectId } })
    if (operation === "create") {
      await expect(reserveStock({ warehouseId, productId, quantity: 2, customerOrderId: orderId })).rejects.toThrow("Commande client introuvable")
      expect(await balance()).toMatchObject({ quantity: 10, reservedQuantity: 0 })
      expect(await prisma.stockReservation.count({ where: { companyId: session.companyId } })).toBe(0)
    } else {
      const reservation = await prisma.stockReservation.create({ data: { companyId: session.companyId, warehouseId, productId, customerOrderId: orderId, quantity: 2 } })
      await prisma.inventoryItem.updateMany({ where: { companyId: session.companyId }, data: { reservedQuantity: 2 } })
      await expect((operation === "release" ? releaseStockReservation : consumeStockReservation)(reservation.id)).rejects.toThrow("Réservation active introuvable")
      expect(await balance()).toMatchObject({ quantity: 10, reservedQuantity: 2 })
      expect(await prisma.stockReservation.findUniqueOrThrow({ where: { id: reservation.id } })).toMatchObject({ status: "ACTIVE" })
    }
    expect(await prisma.stockMovement.count({ where: { companyId: session.companyId } })).toBe(0)
    expect(await prisma.customerOrder.findUniqueOrThrow({ where: { id: orderId } })).toMatchObject({ status: "CONFIRMED" })
  })
  it("preserves a reservation with both coherent references", async () => {
    const reservation = await reserveStock({ warehouseId, productId, projectId, customerOrderId: orderId, quantity: 2 })
    await consumeStockReservation(reservation.id)
    expect(await balance()).toMatchObject({ quantity: 8, reservedQuantity: 0 })
    expect(await prisma.stockMovement.count({ where: { companyId: session.companyId } })).toBe(2)
  })
})
