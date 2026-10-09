import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

type ReadGate = { model: "inventoryItem" | "stockReservation"; arrived: number; values: unknown[]; wait: Promise<void>; release: () => void }
const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
const coordination = vi.hoisted(() => ({ gate: null as ReadGate | null }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/prisma", async importOriginal => {
  const prismaModule = await importOriginal<typeof import("@/lib/prisma")>()
  const real = prismaModule.default, transaction = real.$transaction.bind(real)
  function delegate(model: ReadGate["model"], target: typeof real.inventoryItem | typeof real.stockReservation) {
    return new Proxy(target, { get(object, key) {
      const operation = Reflect.get(object, key)
      if (key !== (model === "inventoryItem" ? "findUnique" : "findFirst")) return operation
      return async (...args: unknown[]) => {
        const result = await Reflect.apply(operation, object, args)
        const gate = coordination.gate
        if (gate?.model === model && gate.arrived < 2) {
          gate.values.push(result)
          if (++gate.arrived === 2) gate.release()
          await gate.wait
        }
        return result
      }
    } })
  }
  const scheduled = (callback: Parameters<typeof transaction>[0], options?: Parameters<typeof transaction>[1]) => transaction(tx => callback(new Proxy(tx, {
    get(target, key) { return key === "inventoryItem" ? delegate("inventoryItem", target.inventoryItem) : Reflect.get(target, key) },
  })), options)
  return { ...prismaModule, default: new Proxy(real, { get(target, key) {
    if (key === "$transaction") return scheduled
    if (key === "stockReservation") return delegate("stockReservation", target.stockReservation)
    return Reflect.get(target, key)
  } }) }
})
import prisma from "@/lib/prisma"
import { consumeStockReservation, releaseStockReservation, reserveStock } from "@/actions/operations"

describe.sequential("stock reservation concurrency preserves persisted balances and movements", () => {
  let membershipId: string, agencyId: string, warehouseId: string, productId: string, projectId: string
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional stock concurrency" } })).id
    session.userId = (await prisma.user.create({ data: { email: `stock-concurrency-${randomUUID()}@example.test` } })).id
    membershipId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OPERATIONS", status: "ACTIVE" } })).id
    agencyId = (await prisma.agency.create({ data: { companyId: session.companyId, name: "Fictional stock agency", code: "STOCK" } })).id
    await prisma.agencyMembership.create({ data: { agencyId, membershipId } })
    const client = await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional stock client" } })
    projectId = (await prisma.project.create({ data: { companyId: session.companyId, clientId: client.id, agencyId, name: "Fictional stock project" } })).id
    warehouseId = (await prisma.warehouse.create({ data: { companyId: session.companyId, agencyId, name: "Fictional stock warehouse", code: "STOCK" } })).id
    productId = (await prisma.product.create({ data: { companyId: session.companyId, sku: "STOCK", label: "Fictional stock product" } })).id
    await prisma.inventoryItem.create({ data: { companyId: session.companyId, warehouseId, productId, quantity: 10 } })
  })
  afterEach(async () => {
    coordination.gate?.release(); coordination.gate = null
    vi.unstubAllEnvs()
    await prisma.stockMovement.deleteMany({ where: { companyId: session.companyId } })
    await prisma.stockReservation.deleteMany({ where: { companyId: session.companyId } })
    await prisma.inventoryItem.updateMany({ where: { companyId: session.companyId }, data: { quantity: 10, reservedQuantity: 0 } })
    await prisma.auditLog.deleteMany({ where: { userId: session.userId } })
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OPERATIONS" } })
    await prisma.agencyMembership.upsert({ where: { agencyId_membershipId: { agencyId, membershipId } }, update: {}, create: { agencyId, membershipId } })
  })
  afterAll(async () => {
    await prisma.inventoryItem.deleteMany({ where: { companyId: session.companyId } })
    await prisma.warehouse.deleteMany({ where: { companyId: session.companyId } })
    await prisma.product.deleteMany({ where: { companyId: session.companyId } })
    await prisma.project.deleteMany({ where: { companyId: session.companyId } })
    await prisma.client.deleteMany({ where: { companyId: session.companyId } })
    await prisma.company.delete({ where: { id: session.companyId } })
    await prisma.user.delete({ where: { id: session.userId } })
  })
  function reserve(quantity: number) { return reserveStock({ warehouseId, productId, projectId, quantity }) }
  async function balance() {
    const current = await prisma.inventoryItem.findUniqueOrThrow({ where: { warehouseId_productId: { warehouseId, productId } } })
    const reservations = await prisma.stockReservation.findMany({ where: { companyId: session.companyId } })
    const movements = await prisma.stockMovement.findMany({ where: { companyId: session.companyId } })
    const active = reservations.filter(row => row.status === "ACTIVE").reduce((sum, row) => sum + row.quantity, 0)
    const consumed = reservations.filter(row => row.status === "CONSUMED").reduce((sum, row) => sum + row.quantity, 0)
    expect(current).toMatchObject({ reservedQuantity: active, quantity: 10 - consumed })
    expect(current.reservedQuantity).toBeGreaterThanOrEqual(0)
    expect(current.reservedQuantity).toBeLessThanOrEqual(current.quantity)
    for (const row of reservations) {
      const linked = movements.filter(movement => movement.reservationId === row.id)
      expect(linked.filter(movement => movement.type === "RESERVE")).toHaveLength(1)
      const terminal = linked.filter(movement => ["RELEASE", "CONSUME"].includes(movement.type))
      expect(terminal).toHaveLength(row.status === "ACTIVE" ? 0 : 1)
      if (terminal.length) expect(terminal[0]).toMatchObject({ type: row.status === "CONSUMED" ? "CONSUME" : "RELEASE", quantity: row.status === "CONSUMED" ? -row.quantity : row.quantity })
    }
    expect(movements.length).toBe(reservations.reduce((sum, row) => sum + (row.status === "ACTIVE" ? 1 : 2), 0))
    return { current, reservations, movements }
  }
  async function concurrent(model: ReadGate["model"], initial: object, actions: Array<() => Promise<unknown>>) {
    let release!: () => void
    const wait = new Promise<void>(resolve => { release = resolve })
    const gate: ReadGate = { model, arrived: 0, values: [], wait, release }
    const postgres = process.env.DATABASE_URL?.startsWith("postgres")
    const deadline = setTimeout(release, 2000)
    if (postgres) coordination.gate = gate
    try {
      const results = await Promise.allSettled(actions.map(action => action()))
      if (postgres) { expect(gate.arrived).toBe(2); expect(gate.values).toEqual([expect.objectContaining(initial), expect.objectContaining(initial)]) }
      expect(results.some(result => result.status === "fulfilled")).toBe(true)
      for (const result of results) if (result.status === "rejected") expect(result.reason).toMatchObject({ message: expect.stringMatching(/Le stock a changé|Réservation incompatible|Cette réservation vient déjà|Réservation active introuvable/) })
      return results
    } finally { release(); clearTimeout(deadline); coordination.gate = null }
  }
  it.each([5, 6, 10])("keeps two concurrent %i-unit reservations within ten available units", async quantity => {
    const results = await concurrent("inventoryItem", { quantity: 10, reservedQuantity: 0 }, [() => reserve(quantity), () => reserve(quantity)])
    const persisted = await balance()
    expect(persisted.reservations.length).toBe(results.filter(result => result.status === "fulfilled").length)
    expect(persisted.current.reservedQuantity).toBe(quantity * persisted.reservations.length)
    if (quantity > 5) expect(persisted.reservations).toHaveLength(1)
  })
  it.each(["release", "consume", "mixed"])("performs only one terminal operation when %s races on a reservation", async kind => {
    const reservation = await reserve(6)
    const first = kind === "consume" ? consumeStockReservation : releaseStockReservation
    const second = kind === "release" ? releaseStockReservation : consumeStockReservation
    const results = await concurrent("stockReservation", { id: reservation.id, status: "ACTIVE" }, [() => first(reservation.id), () => second(reservation.id)])
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1)
    expect((await balance()).reservations[0].status).toEqual(kind === "mixed" ? expect.stringMatching(/^(RELEASED|CONSUMED)$/) : kind === "release" ? "RELEASED" : "CONSUMED")
  })
  it("releases stock for a new reservation without changing physical quantity", async () => {
    const first = await reserve(10)
    await releaseStockReservation(first.id)
    await reserve(10)
    expect((await balance()).current).toMatchObject({ quantity: 10, reservedQuantity: 10 })
  })
  it("rolls back a reservation and movement when stock is insufficient", async () => {
    await expect(reserve(11)).rejects.toThrow("Réservation incompatible")
    expect((await balance()).reservations).toHaveLength(0)
  })
  it("rejects a second terminal operation without changing balances", async () => {
    const reservation = await reserve(6)
    await consumeStockReservation(reservation.id)
    await expect(releaseStockReservation(reservation.id)).rejects.toThrow("Réservation active introuvable")
    await expect(consumeStockReservation(reservation.id)).rejects.toThrow("Réservation active introuvable")
    expect((await balance()).current).toMatchObject({ quantity: 4, reservedQuantity: 0 })
  })
  it("refuses an unassigned warehouse and project", async () => {
    await prisma.agencyMembership.delete({ where: { agencyId_membershipId: { agencyId, membershipId } } })
    await expect(reserve(1)).rejects.toThrow("Dépôt ou produit introuvable")
    expect((await balance()).reservations).toHaveLength(0)
  })
  it("refuses reservation writes for Viewer", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "VIEWER" } })
    await expect(reserve(1)).rejects.toThrow("droits nécessaires")
    expect((await balance()).reservations).toHaveLength(0)
  })
  it("refuses reservations in the public demo", async () => {
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    await expect(reserve(1)).rejects.toThrow("lecture seule")
    expect((await balance()).reservations).toHaveLength(0)
  })
})
