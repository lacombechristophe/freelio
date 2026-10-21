import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import prisma from "@/lib/prisma"
import * as drafts from "@/actions/purchase-drafts"
import { getPurchaseOrderDetail, submitPurchaseOrder, sendPurchaseOrder } from "@/actions/operations"

describe.sequential("Supplier draft editing and pre-transmission cancellation", () => {
  let otherCompanyId: string, membershipId: string, supplierId: string, otherSupplierId: string
  let agencyId: string, otherAgencyId: string, clientId: string, foreignClientId: string, projectId: string, productId: string, foreignProductId: string
  let sequence = 0
  async function seed(status = "DRAFT") {
    const order = await prisma.purchaseOrder.create({ data: {
      companyId: session.companyId, supplierId, projectId, number: `DRAFT-${++sequence}`, status, totalHtCents: 2500,
      expectedAt: new Date("2030-04-10T00:00:00Z"), notes: "Original fictional instructions",
      lines: { create: [{ productId, label: "Original fictional line", quantity: 2, unitPriceCents: 1000, order: 0, sourceKey: "fictional-source" }, { label: "Original free line", quantity: 1, unitPriceCents: 500, order: 1 }] },
    } })
    const detail = await getPurchaseOrderDetail(order.id)
    if (!detail) throw new Error("Missing fixture")
    return detail
  }
  function input(order: Awaited<ReturnType<typeof seed>>) {
    return { id: order.id, revision: order.draftRevision, supplierId: otherSupplierId, projectId, expectedAt: "2030-06-15", notes: "Edited fictional instructions", lines: [{ id: order.lines[0].id, productId, label: "Negotiated label", quantity: 3, unitPriceCents: 1234 }, { label: "Added free line", quantity: 2, unitPriceCents: 50 }] }
  }
  async function snapshot(orderId: string) {
    return Promise.all([
      prisma.purchaseOrder.findUnique({ where: { id: orderId }, include: { lines: { orderBy: { id: "asc" } } } }),
      prisma.auditLog.findMany({ where: { userId: session.userId }, orderBy: { id: "asc" } }),
      prisma.stockMovement.count({ where: { companyId: session.companyId } }),
      prisma.emailDelivery.count({ where: { companyId: session.companyId } }),
    ])
  }
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional supplier draft lifecycle" } })).id
    otherCompanyId = (await prisma.company.create({ data: { name: "Foreign fictional supplier drafts" } })).id
    session.userId = (await prisma.user.create({ data: { email: `purchase-draft-${randomUUID()}@example.test` } })).id
    membershipId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    agencyId = (await prisma.agency.create({ data: { companyId: session.companyId, code: "DRAFT", name: "Allowed fictional agency" } })).id
    otherAgencyId = (await prisma.agency.create({ data: { companyId: session.companyId, code: "OTHER", name: "Other fictional agency" } })).id
    await prisma.agencyMembership.create({ data: { membershipId, agencyId } })
    clientId = (await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional client" } })).id
    foreignClientId = (await prisma.client.create({ data: { companyId: otherCompanyId, name: "Foreign fictional client" } })).id
    projectId = (await prisma.project.create({ data: { companyId: session.companyId, clientId, agencyId, name: "Fictional project" } })).id
    supplierId = (await prisma.supplier.create({ data: { companyId: session.companyId, name: "Fictional initial supplier" } })).id
    otherSupplierId = (await prisma.supplier.create({ data: { companyId: session.companyId, name: "Fictional replacement supplier" } })).id
    productId = (await prisma.product.create({ data: { companyId: session.companyId, sku: "DRAFT", label: "Fictional product", purchasePriceCents: 99999 } })).id
    foreignProductId = (await prisma.product.create({ data: { companyId: otherCompanyId, sku: "FOREIGN", label: "Foreign fictional product" } })).id
  })
  afterEach(async () => {
    vi.restoreAllMocks(); vi.unstubAllEnvs()
    await prisma.auditLog.deleteMany({ where: { userId: session.userId } })
    await prisma.purchaseOrder.deleteMany({ where: { companyId: session.companyId } })
    await prisma.project.update({ where: { id: projectId }, data: { clientId, agencyId, status: "ACTIVE" } })
    await prisma.product.update({ where: { id: productId }, data: { active: true } })
    await prisma.supplier.updateMany({ where: { companyId: session.companyId }, data: { active: true } })
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OWNER", status: "ACTIVE" } })
  })
  afterAll(async () => {
    const where = { companyId: { in: [session.companyId, otherCompanyId] } }
    await prisma.project.deleteMany({ where }); await prisma.product.deleteMany({ where }); await prisma.client.deleteMany({ where }); await prisma.supplier.deleteMany({ where })
    await prisma.company.deleteMany({ where: { id: { in: [session.companyId, otherCompanyId] } } }); await prisma.user.delete({ where: { id: session.userId } })
  })
  it("edits a draft without replacing its number, negotiated prices or surviving source line", async () => {
    const order = await seed()
    expect(await drafts.updatePurchaseDraft(input(order))).toMatchObject({ success: true, id: order.id, number: order.number })
    const saved = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: order.id }, include: { lines: { orderBy: { order: "asc" } } } })
    expect(saved).toMatchObject({ status: "DRAFT", number: order.number, supplierId: otherSupplierId, totalHtCents: 3802, expectedAt: new Date("2030-06-15T00:00:00Z"), notes: "Edited fictional instructions", lines: [{ id: order.lines[0].id, sourceKey: "fictional-source", label: "Negotiated label", quantity: 3, unitPriceCents: 1234 }, { label: "Added free line", quantity: 2, unitPriceCents: 50 }] })
    expect(await prisma.purchaseOrderLine.findUnique({ where: { id: order.lines[1].id } })).toBeNull()
    expect(await prisma.auditLog.findMany({ where: { userId: session.userId } })).toMatchObject([{ action: "UPDATE_PURCHASE_ORDER", resourceId: order.id }])
    expect((await getPurchaseOrderDetail(order.id))!.draftRevision).not.toBe(order.draftRevision)
  })
  it.each(["DRAFT", "PENDING_APPROVAL", "APPROVED"])("cancels %s while preserving all lines and the approval history", async status => {
    const order = await seed(status), original = (await snapshot(order.id))[0]
    expect(await drafts.cancelPurchaseDraft({ id: order.id, revision: order.draftRevision, reason: "Duplicate fictional requirement", confirmed: true })).toEqual({ success: true })
    const saved = (await snapshot(order.id))[0]
    expect(saved).toMatchObject({ ...original, status: "CANCELED", updatedAt: expect.any(Date) })
    expect(await prisma.auditLog.findMany({ where: { userId: session.userId } })).toMatchObject([{ action: "CANCEL_PURCHASE_ORDER", payload: { previousStatus: status, reason: "Duplicate fictional requirement" } }])
    await expect(submitPurchaseOrder(order.id)).rejects.toThrow("Commande brouillon introuvable")
    await expect(sendPurchaseOrder(order.id)).rejects.toThrow("La commande doit être approuvée")
  })
  it.each(["PENDING_APPROVAL", "APPROVED", "SENT", "ACKNOWLEDGED", "PARTIALLY_RECEIVED", "RECEIVED", "RECEIVED_WITH_ISSUES", "CANCELED"])("refuses editing %s with no writes", async status => {
    const order = await seed(status), before = await snapshot(order.id)
    expect(await drafts.updatePurchaseDraft(input(order))).toMatchObject({ success: false })
    expect(await snapshot(order.id)).toEqual(before)
  })
  it.each(["SENT", "ACKNOWLEDGED", "PARTIALLY_RECEIVED", "RECEIVED", "RECEIVED_WITH_ISSUES", "CANCELED"])("refuses cancellation of %s with no writes", async status => {
    const order = await seed(status), before = await snapshot(order.id)
    expect(await drafts.cancelPurchaseDraft({ id: order.id, revision: order.draftRevision, reason: "Fictional cancellation", confirmed: true })).toMatchObject({ success: false })
    expect(await snapshot(order.id)).toEqual(before)
  })
  it.each(["VIEWER", "SALES", "SERVICE", "ACCOUNTING"])("requires operations.write for %s before business reads", async role => {
    const order = await seed(), before = await snapshot(order.id)
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    const read = vi.spyOn(prisma.purchaseOrder, "findFirst")
    await expect(drafts.updatePurchaseDraft(input(order))).rejects.toThrow("droits nécessaires")
    await expect(drafts.cancelPurchaseDraft({ id: order.id, revision: order.draftRevision, reason: "Fictional cancellation", confirmed: true })).rejects.toThrow("droits nécessaires")
    expect(read).not.toHaveBeenCalled(); expect(await snapshot(order.id)).toEqual(before)
  })
  it("allows a technician to edit and cancel drafts but not revoke an approval", async () => {
    const order = await seed(), approved = await seed("APPROVED")
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "TECHNICIAN" } })
    expect(await drafts.updatePurchaseDraft(input(order))).toMatchObject({ success: true })
    const before = await snapshot(approved.id)
    expect(await drafts.cancelPurchaseDraft({ id: approved.id, revision: approved.draftRevision, reason: "Fictional cancellation", confirmed: true })).toMatchObject({ success: false, error: expect.stringContaining("approbation") })
    expect(await snapshot(approved.id)).toEqual(before)
    const fresh = (await getPurchaseOrderDetail(order.id))!
    expect(await drafts.cancelPurchaseDraft({ id: order.id, revision: fresh.draftRevision, reason: "Fictional cancellation", confirmed: true })).toMatchObject({ success: true })
  })
  it.each(["foreign client", "other agency", "inactive product", "inactive supplier", "foreign product"])("refuses an inaccessible replacement: %s", async kind => {
    const order = await seed(), data = input(order)
    if (kind === "foreign client") await prisma.project.update({ where: { id: projectId }, data: { clientId: foreignClientId } })
    if (kind === "other agency") {
      await prisma.membership.update({ where: { id: membershipId }, data: { role: "OPERATIONS" } })
      await prisma.project.update({ where: { id: projectId }, data: { agencyId: otherAgencyId } })
    }
    if (kind === "inactive product") await prisma.product.update({ where: { id: productId }, data: { active: false } })
    if (kind === "inactive supplier") await prisma.supplier.update({ where: { id: otherSupplierId }, data: { active: false } })
    if (kind === "foreign product") data.lines[0].productId = foreignProductId
    const before = await snapshot(order.id)
    expect(await drafts.updatePurchaseDraft(data)).toMatchObject({ success: false })
    expect(await snapshot(order.id)).toEqual(before)
  })
  it("refuses a stale editor and a stale cancellation after a successful edit", async () => {
    const order = await seed(), data = input(order)
    expect(await drafts.updatePurchaseDraft(data)).toMatchObject({ success: true })
    const before = await snapshot(order.id)
    expect(await drafts.updatePurchaseDraft({ ...data, notes: "Stale editor" })).toMatchObject({ success: false, error: expect.stringContaining("a changé") })
    expect(await drafts.cancelPurchaseDraft({ id: order.id, revision: order.draftRevision, reason: "Fictional cancellation", confirmed: true })).toMatchObject({ success: false, error: expect.stringContaining("a changé") })
    expect(await snapshot(order.id)).toEqual(before)
  })
  it("does not turn a submitted draft back into a draft", async () => {
    const order = await seed(); await submitPurchaseOrder(order.id)
    const before = await snapshot(order.id)
    expect(await drafts.updatePurchaseDraft(input(order))).toMatchObject({ success: false })
    expect(await snapshot(order.id)).toEqual(before)
  })
  it("detects changed lines even if a legacy writer did not touch the parent revision", async () => {
    const order = await seed()
    await prisma.purchaseOrderLine.update({ where: { id: order.lines[0].id }, data: { quantity: 5 } })
    const before = await snapshot(order.id)
    expect(await drafts.updatePurchaseDraft(input(order))).toMatchObject({ success: false, error: expect.stringContaining("a changé") })
    expect(await snapshot(order.id)).toEqual(before)
  })
  it("does not accept a line identifier belonging to another draft", async () => {
    const order = await seed(), other = await seed(), data = input(order)
    data.lines[0].id = other.lines[0].id
    const before = await snapshot(order.id), otherBefore = await snapshot(other.id)
    expect(await drafts.updatePurchaseDraft(data)).toMatchObject({ success: false })
    expect(await snapshot(order.id)).toEqual(before); expect(await snapshot(other.id)).toEqual(otherBefore)
  })
  it.each(["negative quantity", "fractional quantity", "overflow", "impossible date", "empty lines", "duplicate line"])("rejects invalid edits: %s", async kind => {
    const order = await seed(), data = input(order)
    if (kind === "negative quantity") data.lines[0].quantity = -1
    if (kind === "fractional quantity") data.lines[0].quantity = 1.5
    if (kind === "overflow") { data.lines[0].quantity = 1000000; data.lines[0].unitPriceCents = 2000000000 }
    if (kind === "impossible date") data.expectedAt = "2030-02-31"
    if (kind === "empty lines") data.lines = []
    if (kind === "duplicate line") data.lines.push(data.lines[0])
    const before = await snapshot(order.id)
    expect(await drafts.updatePurchaseDraft(data)).toMatchObject({ success: false })
    expect(await snapshot(order.id)).toEqual(before)
  })
  it("requires a reason and explicit confirmation before cancellation", async () => {
    const order = await seed(), before = await snapshot(order.id)
    for (const data of [{ reason: "", confirmed: true }, { reason: "Fictional cancellation", confirmed: false }]) {
      expect(await drafts.cancelPurchaseDraft({ id: order.id, revision: order.draftRevision, ...data })).toMatchObject({ success: false })
    }
    expect(await snapshot(order.id)).toEqual(before)
  })
  it("does not detach an agency-limited draft from its project", async () => {
    const order = await seed(), before = await snapshot(order.id)
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OPERATIONS" } })
    expect(await drafts.updatePurchaseDraft({ ...input(order), projectId: "" })).toMatchObject({ success: false, error: expect.stringContaining("chantier accessible") })
    expect(await snapshot(order.id)).toEqual(before)
  })
  it.each(["foreign company", "foreign supplier", "foreign client", "other agency"])("refuses editing and cancellation of an inaccessible original: %s", async kind => {
    const order = await seed()
    if (kind === "foreign company") await prisma.purchaseOrder.update({ where: { id: order.id }, data: { companyId: otherCompanyId } })
    if (kind === "foreign supplier") await prisma.supplier.update({ where: { id: supplierId }, data: { companyId: otherCompanyId } })
    if (kind === "foreign client") await prisma.project.update({ where: { id: projectId }, data: { clientId: foreignClientId } })
    if (kind === "other agency") {
      await prisma.project.update({ where: { id: projectId }, data: { agencyId: otherAgencyId } })
      await prisma.membership.update({ where: { id: membershipId }, data: { role: "OPERATIONS" } })
    }
    const before = await snapshot(order.id)
    expect(await drafts.updatePurchaseDraft(input(order))).toMatchObject({ success: false })
    expect(await drafts.cancelPurchaseDraft({ id: order.id, revision: order.draftRevision, reason: "Fictional cancellation", confirmed: true })).toMatchObject({ success: false })
    expect(await snapshot(order.id)).toEqual(before)
    if (kind === "foreign company") await prisma.purchaseOrder.update({ where: { id: order.id }, data: { companyId: session.companyId } })
    if (kind === "foreign supplier") await prisma.supplier.update({ where: { id: supplierId }, data: { companyId: session.companyId } })
  })
  it.each(["sent timestamp", "received quantity", "credited quantity"])("preserves contradictory historical drafts with %s", async kind => {
    const order = await seed()
    if (kind === "sent timestamp") await prisma.purchaseOrder.update({ where: { id: order.id }, data: { sentAt: new Date() } })
    else await prisma.purchaseOrderLine.update({ where: { id: order.lines[0].id }, data: kind === "received quantity" ? { receivedQuantity: 1 } : { creditedQuantity: 1 } })
    const before = await snapshot(order.id), fresh = (await getPurchaseOrderDetail(order.id))!
    expect(await drafts.updatePurchaseDraft(input(fresh))).toMatchObject({ success: false })
    expect(await drafts.cancelPurchaseDraft({ id: order.id, revision: fresh.draftRevision, reason: "Fictional cancellation", confirmed: true })).toMatchObject({ success: false })
    expect(await snapshot(order.id)).toEqual(before)
  })
  it("allows only one writer for the same displayed draft revision", async () => {
    const order = await seed(), first = input(order), second = { ...input(order), notes: "Other concurrent editor" }
    const outcomes = await Promise.allSettled([drafts.updatePurchaseDraft(first), drafts.updatePurchaseDraft(second)])
    expect(outcomes.filter(result => result.status === "fulfilled" && result.value.success)).toHaveLength(1)
    expect(await prisma.auditLog.count({ where: { userId: session.userId, action: "UPDATE_PURCHASE_ORDER" } })).toBe(1)
    expect(await prisma.purchaseOrderLine.count({ where: { purchaseOrderId: order.id } })).toBe(2)
  })
  it.each(["edit", "cancel"])("rolls back the %s when its audit cannot be written", async kind => {
    const order = await seed(), before = await snapshot(order.id)
    // Fail the real SQL insert, after the business writes in the transaction.
    await prisma.$executeRawUnsafe(`CREATE TRIGGER "fictional_purchase_audit_failure" BEFORE INSERT ON "AuditLog" WHEN NEW."action" IN ('UPDATE_PURCHASE_ORDER', 'CANCEL_PURCHASE_ORDER') BEGIN SELECT RAISE(ABORT, 'Fictional audit failure'); END`)
    try {
      const operation = kind === "edit" ? drafts.updatePurchaseDraft(input(order)) : drafts.cancelPurchaseDraft({ id: order.id, revision: order.draftRevision, reason: "Fictional cancellation", confirmed: true })
      await expect(operation).rejects.toThrow()
    } finally { await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS "fictional_purchase_audit_failure"') }
    expect(await snapshot(order.id)).toEqual(before)
  })
  it("rejects mutation in the public read-only demo", async () => {
    const order = await seed(), before = await snapshot(order.id)
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    await expect(drafts.updatePurchaseDraft(input(order))).rejects.toThrow()
    await expect(drafts.cancelPurchaseDraft({ id: order.id, revision: order.draftRevision, reason: "Fictional cancellation", confirmed: true })).rejects.toThrow()
    expect(await snapshot(order.id)).toEqual(before)
  })
})
