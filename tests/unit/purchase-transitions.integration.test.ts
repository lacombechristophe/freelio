import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import prisma from "@/lib/prisma"
import { submitPurchaseOrder, approvePurchaseOrder, sendPurchaseOrder, acknowledgePurchaseOrder } from "@/actions/operations"

const transitions = [
  { status: "DRAFT", next: "PENDING_APPROVAL", action: "SUBMIT_PURCHASE_ORDER", run: submitPurchaseOrder },
  { status: "PENDING_APPROVAL", next: "APPROVED", action: "APPROVE_PURCHASE_ORDER", run: approvePurchaseOrder },
  { status: "APPROVED", next: "SENT", action: "SEND_PURCHASE_ORDER", run: sendPurchaseOrder },
  { status: "SENT", next: "ACKNOWLEDGED", action: "ACKNOWLEDGE_PURCHASE_ORDER", run: (id: string) => acknowledgePurchaseOrder({ purchaseOrderId: id, supplierReference: "FICTIONAL-ACK", confirmedExpectedAt: "2032-02-29" }) },
] as const

describe.sequential("Supplier purchase transitions on real SQL", () => {
  let foreignCompanyId: string, membershipId: string, foreignMemberId: string, foreignUserId: string
  let agencyId: string, otherAgencyId: string, clientId: string, foreignClientId: string, projectId: string
  let supplierId: string, foreignSupplierId: string, productId: string, foreignProductId: string, sequence = 0
  async function seed(status: string) {
    return prisma.purchaseOrder.create({ data: { companyId: session.companyId, supplierId, projectId, number: `TRANSITION-${++sequence}`, status, totalHtCents: 500,
      lines: { create: [{ productId, label: "Fictional product line", quantity: 1, unitPriceCents: 500 }] },
    }, include: { lines: true } })
  }
  async function snapshot(id: string) {
    return Promise.all([
      prisma.purchaseOrder.findUniqueOrThrow({ where: { id }, include: { lines: true } }),
      prisma.auditLog.findMany({ where: { userId: session.userId }, orderBy: { id: "asc" } }),
      prisma.stockMovement.count({ where: { companyId: session.companyId } }),
      prisma.emailDelivery.count({ where: { companyId: session.companyId } }),
    ])
  }
  function changeAfterPreparation(change: () => Promise<unknown>) {
    const read = prisma.purchaseOrder.findFirst.bind(prisma.purchaseOrder)
    const interleaved = (async (args: Parameters<typeof read>[0]) => { const result = await read(args); await change(); return result }) as typeof read
    vi.spyOn(prisma.purchaseOrder, "findFirst").mockImplementationOnce(interleaved)
  }
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional purchase transitions" } })).id
    foreignCompanyId = (await prisma.company.create({ data: { name: "Foreign fictional transitions" } })).id
    session.userId = (await prisma.user.create({ data: { email: `purchase-transitions-${randomUUID()}@example.test` } })).id
    foreignUserId = (await prisma.user.create({ data: { email: `foreign-transitions-${randomUUID()}@example.test` } })).id
    membershipId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    foreignMemberId = (await prisma.membership.create({ data: { companyId: foreignCompanyId, userId: foreignUserId, role: "OWNER", status: "ACTIVE" } })).id
    agencyId = (await prisma.agency.create({ data: { companyId: session.companyId, code: "LOCAL", name: "Allowed agency" } })).id
    otherAgencyId = (await prisma.agency.create({ data: { companyId: session.companyId, code: "OTHER", name: "Other agency" } })).id
    await prisma.agencyMembership.create({ data: { membershipId, agencyId } })
    clientId = (await prisma.client.create({ data: { companyId: session.companyId, name: "Local client" } })).id
    foreignClientId = (await prisma.client.create({ data: { companyId: foreignCompanyId, name: "Foreign client" } })).id
    projectId = (await prisma.project.create({ data: { companyId: session.companyId, clientId, agencyId, name: "Local project" } })).id
    supplierId = (await prisma.supplier.create({ data: { companyId: session.companyId, name: "Local supplier" } })).id
    foreignSupplierId = (await prisma.supplier.create({ data: { companyId: foreignCompanyId, name: "Foreign supplier" } })).id
    productId = (await prisma.product.create({ data: { companyId: session.companyId, sku: "LOCAL", label: "Local product" } })).id
    foreignProductId = (await prisma.product.create({ data: { companyId: foreignCompanyId, sku: "FOREIGN", label: "Foreign product" } })).id
  })
  afterEach(async () => {
    vi.restoreAllMocks(); vi.unstubAllEnvs()
    await prisma.auditLog.deleteMany({ where: { userId: session.userId } }); await prisma.purchaseOrder.deleteMany({ where: { companyId: session.companyId } })
    await prisma.project.update({ where: { id: projectId }, data: { clientId, agencyId } })
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OWNER", status: "ACTIVE" } })
  })
  afterAll(async () => {
    const where = { companyId: { in: [session.companyId, foreignCompanyId] } }
    await prisma.product.deleteMany({ where }); await prisma.supplier.deleteMany({ where }); await prisma.project.deleteMany({ where }); await prisma.client.deleteMany({ where })
    await prisma.company.deleteMany({ where: { id: { in: [session.companyId, foreignCompanyId] } } }); await prisma.user.deleteMany({ where: { id: { in: [session.userId, foreignUserId] } } })
  })
  for (const transition of transitions) {
    it(`${transition.action}: changes state once, preserves lines and records one audit`, async () => {
      const order = await seed(transition.status)
      expect(await transition.run(order.id)).toEqual({ success: true })
      const saved = await snapshot(order.id)
      expect(saved[0]).toMatchObject({ status: transition.next, lines: order.lines, totalHtCents: 500 })
      expect(saved[1]).toMatchObject([{ action: transition.action, resourceId: order.id }]); expect(saved[1]).toHaveLength(1)
      expect(saved.slice(2)).toEqual([0, 0])
      if (transition.status !== "SENT") { await expect(transition.run(order.id)).rejects.toThrow(); expect(await snapshot(order.id)).toEqual(saved) }
      else expect(saved[0].confirmedExpectedAt).toEqual(new Date("2032-02-29T00:00:00Z"))
    })
    it.each(["supplier", "client", "product", "approver"])(`${transition.action}: refuses foreign %s without writing`, async kind => {
      const order = await seed(transition.status)
      if (kind === "supplier") await prisma.purchaseOrder.update({ where: { id: order.id }, data: { supplierId: foreignSupplierId } })
      if (kind === "client") await prisma.project.update({ where: { id: projectId }, data: { clientId: foreignClientId } })
      if (kind === "product") await prisma.purchaseOrderLine.update({ where: { id: order.lines[0].id }, data: { productId: foreignProductId } })
      if (kind === "approver") await prisma.purchaseOrder.update({ where: { id: order.id }, data: { approvedByMembershipId: foreignMemberId } })
      const before = await snapshot(order.id)
      await expect(transition.run(order.id)).rejects.toThrow(); expect(await snapshot(order.id)).toEqual(before)
    })
    it(`${transition.action}: rechecks references changed after preparation`, async () => {
      const order = await seed(transition.status)
      changeAfterPreparation(() => prisma.project.update({ where: { id: projectId }, data: { clientId: foreignClientId } }))
      await expect(transition.run(order.id)).rejects.toThrow()
      expect((await snapshot(order.id))[0]).toMatchObject({ status: transition.status, lines: order.lines })
      expect(await prisma.auditLog.count({ where: { userId: session.userId } })).toBe(0)
      expect((await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).clientId).toBe(foreignClientId)
    })
    it(`${transition.action}: rejects received line history even with a stale status`, async () => {
      const order = await seed(transition.status)
      await prisma.purchaseOrderLine.update({ where: { id: order.lines[0].id }, data: { receivedQuantity: 1 } })
      const before = await snapshot(order.id)
      await expect(transition.run(order.id)).rejects.toThrow(); expect(await snapshot(order.id)).toEqual(before)
    })
    it(`${transition.action}: preserves a line changed without touching the parent revision`, async () => {
      const order = await seed(transition.status)
      changeAfterPreparation(() => prisma.purchaseOrderLine.update({ where: { id: order.lines[0].id }, data: { label: "Legitimate concurrent instructions" } }))
      await expect(transition.run(order.id)).rejects.toThrow("a changé")
      const saved = await snapshot(order.id)
      expect(saved[0]).toMatchObject({ status: transition.status, lines: [{ label: "Legitimate concurrent instructions" }] })
      expect(saved[1]).toEqual([])
    })
    it(`${transition.action}: rolls back if its audit cannot be saved`, async () => {
      const order = await seed(transition.status), before = await snapshot(order.id)
      const sqlite = process.env.DATABASE_URL?.startsWith("file:")
      if (sqlite) await prisma.$executeRawUnsafe(`CREATE TRIGGER "fictional_purchase_transition_audit" BEFORE INSERT ON "AuditLog" WHEN NEW."action" = '${transition.action}' BEGIN SELECT RAISE(ABORT, 'Fictional audit failure'); END`)
      else {
        await prisma.$executeRawUnsafe(`CREATE FUNCTION fictional_purchase_transition_audit() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'Fictional audit failure'; END; $$ LANGUAGE plpgsql`)
        await prisma.$executeRawUnsafe(`CREATE TRIGGER fictional_purchase_transition_audit BEFORE INSERT ON "AuditLog" FOR EACH ROW WHEN (NEW."action" = '${transition.action}') EXECUTE FUNCTION fictional_purchase_transition_audit()`)
      }
      try { await expect(transition.run(order.id)).rejects.toThrow(); expect(await snapshot(order.id)).toEqual(before) }
      finally {
        if (sqlite) await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS "fictional_purchase_transition_audit"')
        else { await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS fictional_purchase_transition_audit ON "AuditLog"'); await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS fictional_purchase_transition_audit()') }
      }
    })
    it(`${transition.action}: refuses another agency and the public read-only demo`, async () => {
      const order = await seed(transition.status)
      await prisma.project.update({ where: { id: projectId }, data: { agencyId: otherAgencyId } })
      await prisma.membership.update({ where: { id: membershipId }, data: { role: "OPERATIONS" } })
      const before = await snapshot(order.id)
      await expect(transition.run(order.id)).rejects.toThrow(); expect(await snapshot(order.id)).toEqual(before)
      vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
      await expect(transition.run(order.id)).rejects.toThrow("lecture seule"); expect(await snapshot(order.id)).toEqual(before)
    })
  }
  it("does not overwrite a reception completed after acknowledgement preparation", async () => {
    const order = await seed("SENT")
    changeAfterPreparation(async () => {
      await prisma.$transaction([
        prisma.purchaseOrderLine.update({ where: { id: order.lines[0].id }, data: { receivedQuantity: 1 } }),
        prisma.purchaseOrder.update({ where: { id: order.id }, data: { status: "RECEIVED", receivedAt: new Date("2032-03-01T12:00:00Z") } }),
      ])
    })
    await expect(transitions[3].run(order.id)).rejects.toThrow()
    const saved = await snapshot(order.id)
    expect(saved[0]).toMatchObject({ status: "RECEIVED", receivedAt: new Date("2032-03-01T12:00:00Z"), lines: [{ receivedQuantity: 1 }] })
    expect(saved[1]).toEqual([])
  })
  it.each(["2030-02-31", "2031-02-29", "2030-04-31", "2030-1-1", "2030-01-01T12:00:00Z"])("refuses a noncanonical supplier day: %s", async confirmedExpectedAt => {
    const order = await seed("SENT"), before = await snapshot(order.id)
    await expect(acknowledgePurchaseOrder({ purchaseOrderId: order.id, supplierReference: "FICTIONAL", confirmedExpectedAt })).rejects.toThrow()
    expect(await snapshot(order.id)).toEqual(before)
  })
  it("allows Accounting approval without general Operations writes", async () => {
    const order = await seed("PENDING_APPROVAL")
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "ACCOUNTING" } })
    expect(await approvePurchaseOrder(order.id)).toEqual({ success: true })
    await expect(sendPurchaseOrder(order.id)).rejects.toThrow("droits nécessaires")
  })
  it("allows Owner general supplies and free lines, and editing an existing acknowledgement", async () => {
    const order = await seed("DRAFT")
    await prisma.purchaseOrder.update({ where: { id: order.id }, data: { projectId: null } })
    await prisma.purchaseOrderLine.update({ where: { id: order.lines[0].id }, data: { productId: null } })
    for (const transition of transitions) expect(await transition.run(order.id)).toEqual({ success: true })
    expect(await acknowledgePurchaseOrder({ purchaseOrderId: order.id, supplierReference: "CORRECTED", confirmedExpectedAt: "2032-03-10" })).toEqual({ success: true })
    expect((await snapshot(order.id))[0]).toMatchObject({ status: "ACKNOWLEDGED", supplierReference: "CORRECTED" })
  })
})
