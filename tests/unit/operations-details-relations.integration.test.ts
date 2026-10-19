import { PrismaClient } from "@prisma/client"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { createOperationsDetailsFixture } from "../helpers/operations-details-fixture"
const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import { getEquipmentDetail, getFieldInterventionDetail, getServiceTicketDetail, getPurchaseOrderDetail } from "@/actions/operations"
const db = new PrismaClient()
describe.sequential("Operations detail relations on real SQL", () => {
  let fixture: Awaited<ReturnType<typeof createOperationsDetailsFixture>>
  const readers = { equipments: getEquipmentDetail, interventions: getFieldInterventionDetail, tickets: getServiceTicketDetail, purchaseOrders: getPurchaseOrderDetail }
  beforeAll(async () => { fixture = await createOperationsDetailsFixture(db); session.companyId = fixture.companyId; session.userId = fixture.user.id })
  afterEach(async () => {
    vi.unstubAllEnvs()
    session.companyId = fixture.companyId
    await db.membership.update({ where: { id: fixture.member.id }, data: { role: "OWNER", status: "ACTIVE" } })
  })
  afterAll(async () => { if (fixture) await fixture.cleanup(); await db.$disconnect() })
  it.each(["equipments", "interventions", "tickets", "purchaseOrders"] as const)("keeps a coherent %s detail", async key => {
    expect(await readers[key](fixture.positive[key])).not.toBeNull()
  })
  it.each(["equipments", "interventions", "tickets", "purchaseOrders"] as const)("rejects a %s detail linked to a foreign client or supplier", async key => {
    expect(await readers[key](fixture.negative[key])).toBeNull()
  })
  it.each(["equipments", "interventions", "tickets", "purchaseOrders"] as const)("does not return foreign nested markers in coherent %s detail", async key => {
    const payload = JSON.stringify(await readers[key](fixture.positive[key]))
    expect(payload).not.toContain("FOREIGN-OPERATIONS-")
    for (const id of fixture.forbiddenIds) expect(payload).not.toContain(id)
    expect(payload).not.toContain("private-bcc@example.test")
  })
  it("preserves filtered equipment history and its intervention counts", async () => {
    const detail = await getEquipmentDetail(fixture.positive.equipments)
    expect(detail?.tickets.map(row => row.id).sort()).toEqual([fixture.ticket.id, fixture.otherTicket.id].sort())
    expect(detail?.tickets.find(row => row.id === fixture.ticket.id)?._count.interventions).toBe(2)
    expect(detail?.maintenanceContracts.map(row => row.contract.id)).toEqual([fixture.positive.contracts])
  })
  it("preserves operational costs, files and reservations without granting Finance", async () => {
    await db.membership.update({ where: { id: fixture.member.id }, data: { role: "TECHNICIAN" } })
    const detail = await getFieldInterventionDetail(fixture.positive.interventions)
    expect(detail?.expenses.map(row => row.id)).toEqual([fixture.goodExpense.id])
    expect(detail?.stockMovements.map(row => row.id)).toEqual([fixture.goodMovement.id])
    expect(detail?.reservations.map(row => row.title)).toEqual(["Fictional permitted reservation"])
    expect(detail?.files.map(row => row.id)).toEqual([fixture.file.id])
  })
  it("filters each purchase history at both the order and line levels", async () => {
    const detail = await getPurchaseOrderDetail(fixture.purchase.id)
    const line = detail?.lines.find(row => row.id === fixture.line.id)
    expect(detail?.lines).toHaveLength(2)
    expect(detail?.issues.map(row => row.id)).toEqual([fixture.goodIssue.id])
    expect(detail?.supplierReturns.map(row => row.id)).toEqual([fixture.goodReturn.id])
    expect(line?.supplierReturns.map(row => row.id)).toEqual([fixture.goodReturn.id])
    const receipt = detail?.goodsReceipts.find(row => row.id === fixture.positive.goodsReceipts)
    expect(receipt?.lines.map(row => row.id)).toEqual([fixture.goodReceiptLine.id])
    expect(receipt?.lines[0].issues.map(row => row.id)).toEqual([fixture.goodIssue.id])
    expect(line?.receiptLines.find(row => row.id === fixture.goodReceiptLine.id)?.issues.map(row => row.id)).toEqual([fixture.goodIssue.id])
  })
  it("preserves coherent merged histories and former authors", async () => {
    const detail = await getServiceTicketDetail(fixture.ticket.id)
    expect(detail?.notes.map(row => row.id).sort()).toEqual(fixture.notes.toSorted())
    expect(detail?.diagnostics.map(row => row.id).sort()).toEqual(fixture.diagnostics.toSorted())
    expect(detail?.mergedTickets).toEqual([expect.objectContaining({ id: fixture.merged.id, noteCount: 2, conversationCount: 1 })])
    expect(detail?.emailThreads.map(row => row.id).sort()).toEqual([...fixture.threads, fixture.privateThread.id].sort())
  })
  it("retains private mailbox ACLs after changing roles in the same session", async () => {
    expect((await getServiceTicketDetail(fixture.ticket.id))?.emailThreads.map(row => row.id)).toContain(fixture.privateThread.id)
    await db.membership.update({ where: { id: fixture.member.id }, data: { role: "SERVICE" } })
    const detail = await getServiceTicketDetail(fixture.ticket.id)
    expect(detail?.emailThreads.map(row => row.id).sort()).toEqual(fixture.threads.toSorted())
    expect(detail?.mergedTickets[0].conversationCount).toBe(1)
    expect(JSON.stringify(detail)).not.toContain(fixture.privateThread.id)
  })
  it.each(["siteId", "ticketId", "projectId", "maintenanceContractId", "assignedMembershipId"] as const)("rejects an intervention with inaccessible %s", async field => {
    const original = await db.fieldIntervention.findUniqueOrThrow({ where: { id: fixture.positive.interventions } })
    const inaccessible = { siteId: fixture.negative.sites, ticketId: fixture.negative.tickets, projectId: fixture.negative.projects,
      maintenanceContractId: fixture.negative.contracts, assignedMembershipId: fixture.foreignMember.id }
    await db.fieldIntervention.update({ where: { id: original.id }, data: { [field]: inaccessible[field] } })
    try { expect(await getFieldInterventionDetail(original.id)).toBeNull() }
    finally { await db.fieldIntervention.update({ where: { id: original.id }, data: { [field]: original[field] } }) }
  })
  it.each(["siteId", "equipmentId", "assignedMembershipId", "mergedIntoTicketId"] as const)("rejects a ticket with inaccessible %s", async field => {
    const original = await db.serviceTicket.findUniqueOrThrow({ where: { id: fixture.ticket.id } })
    const inaccessible = { siteId: fixture.negative.sites, equipmentId: fixture.extra[0].id, assignedMembershipId: fixture.foreignMember.id, mergedIntoTicketId: fixture.negative.tickets }
    await db.serviceTicket.update({ where: { id: original.id }, data: { [field]: inaccessible[field] } })
    try { expect(await getServiceTicketDetail(original.id)).toBeNull() }
    finally { await db.serviceTicket.update({ where: { id: original.id }, data: { [field]: original[field] } }) }
  })
  it.each(["projectId", "approvedByMembershipId"] as const)("rejects a purchase with inaccessible %s", async field => {
    const original = await db.purchaseOrder.findUniqueOrThrow({ where: { id: fixture.purchase.id } })
    const value = field === "projectId" ? fixture.negative.projects : fixture.foreignMember.id
    await db.purchaseOrder.update({ where: { id: original.id }, data: { [field]: value } })
    try { expect(await getPurchaseOrderDetail(original.id)).toBeNull() }
    finally { await db.purchaseOrder.update({ where: { id: original.id }, data: { [field]: original[field] } }) }
  })
  it("rejects an entire purchase with a foreign line product", async () => {
    const original = await db.purchaseOrderLine.findUniqueOrThrow({ where: { id: fixture.line.id } })
    await db.purchaseOrderLine.update({ where: { id: original.id }, data: { productId: fixture.foreignProduct.id } })
    try { expect(await getPurchaseOrderDetail(fixture.purchase.id)).toBeNull() }
    finally { await db.purchaseOrderLine.update({ where: { id: original.id }, data: { productId: original.productId } }) }
  })
  it("rejects equipment with a foreign product", async () => { expect(await getEquipmentDetail(fixture.extra[0].id)).toBeNull() })
  it("preserves absent optional relations for an administrator", async () => {
    expect(await getEquipmentDetail(fixture.optionalEquipment.id)).toMatchObject({ product: null })
    expect(await getServiceTicketDetail(fixture.optionalTicket.id)).toMatchObject({ site: null, equipment: null, assignedMembership: null })
    expect(await getPurchaseOrderDetail(fixture.optionalPurchase.id)).toMatchObject({ project: null, approvedByMembership: null, lines: [] })
  })
  it("preserves inactive local historical assignees and approvers", async () => {
    await db.membership.update({ where: { id: fixture.member.id }, data: { status: "SUSPENDED" } })
    const user = await db.user.create({ data: { email: "detail-history-" + fixture.user.email } })
    await db.membership.create({ data: { companyId: fixture.companyId, userId: user.id, role: "ADMIN", status: "ACTIVE" } })
    session.userId = user.id
    try {
      expect((await getServiceTicketDetail(fixture.ticket.id))?.assignedMembership?.id).toBe(fixture.member.id)
      expect((await getFieldInterventionDetail(fixture.positive.interventions))?.assignedMembership?.id).toBe(fixture.member.id)
      expect((await getPurchaseOrderDetail(fixture.purchase.id))?.approvedByMembership?.id).toBe(fixture.member.id)
    } finally {
      session.userId = fixture.user.id
      await db.membership.deleteMany({ where: { userId: user.id } })
      await db.user.delete({ where: { id: user.id } })
    }
  })
  it("filters other-agency roots, receipts and nested counts for a technician", async () => {
    await db.membership.update({ where: { id: fixture.member.id }, data: { role: "TECHNICIAN" } })
    expect(await getEquipmentDetail(fixture.otherEquipment.id)).toBeNull()
    expect(await getFieldInterventionDetail(fixture.otherIntervention.id)).toBeNull()
    expect(await getServiceTicketDetail(fixture.otherTicket.id)).toBeNull()
    expect(await getPurchaseOrderDetail(fixture.otherPurchase.id)).toBeNull()
    const equipment = await getEquipmentDetail(fixture.positive.equipments)
    expect(equipment?.tickets.map(row => row.id)).toEqual([fixture.ticket.id])
    expect(equipment?.tickets[0]._count.interventions).toBe(1)
    expect((await getServiceTicketDetail(fixture.ticket.id))?.interventions.map(row => row.id)).toEqual([fixture.positive.interventions])
    const purchase = await getPurchaseOrderDetail(fixture.purchase.id)
    expect(purchase?.goodsReceipts.map(row => row.id)).toEqual([fixture.positive.goodsReceipts])
    expect(JSON.stringify(purchase)).not.toContain(fixture.otherReceiptLine.id)
    expect(purchase?.canApprovePurchases).toBe(false)
  })
  it.each(["equipments", "interventions", "tickets", "purchaseOrders"] as const)("rereads revoked agency access for %s", async key => {
    await db.membership.update({ where: { id: fixture.member.id }, data: { role: "TECHNICIAN" } })
    await db.agencyMembership.deleteMany({ where: { membershipId: fixture.member.id, agencyId: fixture.agency.id } })
    try { expect(await readers[key](fixture.positive[key])).toBeNull() }
    finally { await db.agencyMembership.create({ data: { membershipId: fixture.member.id, agencyId: fixture.agency.id } }) }
  })
  it.each(["equipments", "interventions", "tickets", "purchaseOrders"] as const)("rejects a suspended reader for %s", async key => {
    await db.membership.update({ where: { id: fixture.member.id }, data: { status: "SUSPENDED" } })
    await expect(readers[key](fixture.positive[key])).rejects.toThrow("plus accès")
  })
  it("does not mutate, repair, audit or send when reading the public demo", async () => {
    const before = await fixture.snapshot()
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    for (const key of ["equipments", "interventions", "tickets", "purchaseOrders"] as const) {
      expect(await readers[key](fixture.positive[key])).not.toBeNull()
      expect(await readers[key](fixture.negative[key])).toBeNull()
    }
    expect(await fixture.snapshot()).toEqual(before)
  })
})
