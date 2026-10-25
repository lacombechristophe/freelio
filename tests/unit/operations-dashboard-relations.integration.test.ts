import { createDatabaseClient } from "@/lib/database-client"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { createOperationsDashboardFixture, dashboardCollections } from "../helpers/operations-dashboard-fixture"

const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import { getOperationsDashboard } from "@/actions/operations"

const database = createDatabaseClient()
type Dashboard = Awaited<ReturnType<typeof getOperationsDashboard>>

describe.sequential("Operations dashboard relation isolation on real SQL", () => {
  let fixture: Awaited<ReturnType<typeof createOperationsDashboardFixture>>
  beforeAll(async () => {
    fixture = await createOperationsDashboardFixture(database)
    session.companyId = fixture.companyId
    session.userId = fixture.user.id
  })
  afterEach(async () => {
    vi.unstubAllEnvs()
    await database.membership.update({ where: { id: fixture.member.id }, data: { role: "OWNER", status: "ACTIVE" } })
  })
  afterAll(async () => {
    if (fixture) await fixture.cleanup()
    await database.$disconnect()
  })
  const ids = (data: Dashboard, key: typeof dashboardCollections[number]) => data[key].map(row => row.id)
  it.each(dashboardCollections)("keeps coherent %s records accessible", async key => {
    expect(ids(await getOperationsDashboard(), key)).toContain(fixture.positive[key])
  })
  it.each(dashboardCollections)("does not disclose a %s record with a foreign client or supplier relation", async key => {
    expect(ids(await getOperationsDashboard(), key)).not.toContain(fixture.negative[key])
  })
  it.each(["equipment product of another company", "ticket assignee of another company", "receipt warehouse of another company"])("does not disclose %s", async name => {
    const item = fixture.extra.find(item => item.name === name)!
    expect(ids(await getOperationsDashboard(), item.key)).not.toContain(item.id)
  })
  it("excludes foreign IDs and markers from the complete server payload", async () => {
    const payload = JSON.stringify(await getOperationsDashboard())
    for (const id of [...Object.values(fixture.negative), ...fixture.extra.map(item => item.id), fixture.foreignEquipment.id,
      fixture.childIntervention.id, fixture.badTransfer.id, fixture.foreignAgency.id]) expect(payload).not.toContain(id)
    expect(payload).not.toContain("FOREIGN-OPERATIONS-")
  })
  it("filters nested site, ticket, maintenance and order counters", async () => {
    const data = await getOperationsDashboard()
    expect(data.sites.find(row => row.id === fixture.site.id)?._count).toEqual({ equipments: 2, serviceTickets: 1 })
    expect(data.tickets.find(row => row.id === fixture.ticket.id)?._count.interventions).toBe(2)
    expect(data.contracts.find(row => row.id === fixture.positive.contracts)?._count).toEqual({ equipments: 1, renewedContracts: 1 })
    expect(data.customerOrders.find(row => row.id === fixture.positive.customerOrders)?._count).toMatchObject({ deliveryNotes: 1, stockReservations: 1 })
  })
  it("filters nested history without losing valid operational costs, free lines or receipts", async () => {
    const data = await getOperationsDashboard()
    const intervention = data.interventions.find(row => row.id === fixture.positive.interventions)!
    expect(intervention.expenses.map(row => row.id)).toEqual([fixture.goodExpense.id])
    expect(intervention.stockMovements.map(row => row.id)).toEqual([fixture.goodMovement.id])
    expect(intervention.reservations.map(row => row.title)).toEqual(["Fictional permitted reservation"])
    const purchase = data.purchaseOrders.find(row => row.id === fixture.positive.purchaseOrders)!
    expect(purchase.lines).toHaveLength(2)
    expect(purchase.lines.some(row => row.productId === null)).toBe(true)
    expect(purchase.issues.map(row => row.id)).toEqual([fixture.goodIssue.id])
    expect(purchase.supplierReturns.map(row => row.id)).toEqual([fixture.goodReturn.id])
    expect(purchase.lines.find(row => row.id === fixture.line.id)?.supplierReturns).toEqual([{ quantity: 1 }])
    expect(data.goodsReceipts.find(row => row.id === fixture.positive.goodsReceipts)?.lines.map(row => row.id)).toEqual([fixture.goodReceiptLine.id])
    expect(data.goodsReceipts.find(row => row.id === fixture.positive.goodsReceipts)?.lines[0].issues.map(row => row.id)).toEqual([fixture.goodIssue.id])
    const contract = data.contracts.find(row => row.id === fixture.positive.contracts)!
    expect(contract.renewalProposals.map(row => row.id)).toEqual([fixture.proposal.id])
    expect(contract.recurringInvoice?.id).toBe(fixture.recurring.id)
    expect(data.stockTransfers.map(row => row.id)).toContain(fixture.stockTransfer.id)
    expect(data.reservations.map(row => row.id)).toEqual([fixture.reservation.id])
  })
  it("allows absent optional relations for a company administrator", async () => {
    const data = await getOperationsDashboard()
    expect(ids(data, "equipments")).toContain(fixture.optionalEquipment.id)
    expect(ids(data, "tickets")).toContain(fixture.optionalTicket.id)
    expect(ids(data, "purchaseOrders")).toContain(fixture.optionalPurchase.id)
  })
  it("excludes a purchase with a foreign approver, then reads the restored history", async () => {
    await database.purchaseOrder.update({ where: { id: fixture.purchase.id }, data: { approvedByMembershipId: fixture.foreignMember.id } })
    try {
      expect(ids(await getOperationsDashboard(), "purchaseOrders")).not.toContain(fixture.purchase.id)
    } finally {
      await database.purchaseOrder.update({ where: { id: fixture.purchase.id }, data: { approvedByMembershipId: fixture.member.id } })
    }
    expect(ids(await getOperationsDashboard(), "purchaseOrders")).toContain(fixture.purchase.id)
  })
  it("excludes purchases and their receipts when a line points to a foreign product", async () => {
    const line = await database.purchaseOrderLine.findUniqueOrThrow({ where: { id: fixture.line.id } })
    await database.purchaseOrderLine.update({ where: { id: line.id }, data: { productId: fixture.foreignProduct.id } })
    try {
      const data = await getOperationsDashboard()
      expect(ids(data, "purchaseOrders")).not.toContain(fixture.purchase.id)
      expect(ids(data, "goodsReceipts")).not.toContain(fixture.positive.goodsReceipts)
    } finally { await database.purchaseOrderLine.update({ where: { id: line.id }, data: { productId: line.productId } }) }
  })
  it("excludes a contract with a foreign recurring client instead of returning its identifier", async () => {
    await database.recurringInvoice.update({ where: { id: fixture.recurring.id }, data: { clientId: fixture.foreignClient.id } })
    try {
      const data = await getOperationsDashboard()
      expect(ids(data, "contracts")).not.toContain(fixture.positive.contracts)
      expect(JSON.stringify(data)).not.toContain(fixture.recurring.id)
    } finally { await database.recurringInvoice.update({ where: { id: fixture.recurring.id }, data: { clientId: fixture.recurring.clientId } }) }
  })
  it.each(["TECHNICIAN", "OPERATIONS", "SERVICE"])("keeps agency limits and nested counters for %s", async role => {
    await database.membership.update({ where: { id: fixture.member.id }, data: { role } })
    const data = await getOperationsDashboard()
    for (const key of dashboardCollections) expect(ids(data, key)).toContain(fixture.positive[key])
    expect(ids(data, "sites")).not.toContain(fixture.otherSite.id)
    expect(ids(data, "interventions")).not.toContain(fixture.otherIntervention.id)
    expect(data.tickets.find(row => row.id === fixture.ticket.id)?._count.interventions).toBe(1)
    expect(data.agencies.map(row => row.id)).toEqual([fixture.agency.id])
    expect(data.members.find(row => row.id === fixture.member.id)?.agencyMemberships).toEqual([{ agencyId: fixture.agency.id, isPrimary: false }])
    expect(data.customerOrders.find(row => row.id === fixture.positive.customerOrders)).toMatchObject({ billingStatus: null, invoices: [], _count: { invoices: null } })
  })
  it("preserves inactive local historical assignments", async () => {
    await database.membership.update({ where: { id: fixture.member.id }, data: { status: "SUSPENDED" } })
    const reader = await database.user.create({ data: { email: "historical-" + fixture.user.email } })
    await database.membership.create({ data: { companyId: fixture.companyId, userId: reader.id, role: "ADMIN", status: "ACTIVE" } })
    session.userId = reader.id
    try {
      const data = await getOperationsDashboard()
      expect(data.tickets.find(row => row.id === fixture.ticket.id)?.assignedMembership?.id).toBe(fixture.member.id)
      expect(data.members.map(row => row.id)).not.toContain(fixture.member.id)
    } finally {
      session.userId = fixture.user.id
      await database.membership.deleteMany({ where: { userId: reader.id } })
      await database.user.delete({ where: { id: reader.id } })
    }
  })
  it("rereads revoked agency access", async () => {
    await database.membership.update({ where: { id: fixture.member.id }, data: { role: "TECHNICIAN" } })
    await database.agencyMembership.deleteMany({ where: { membershipId: fixture.member.id, agencyId: fixture.agency.id } })
    try {
      const data = await getOperationsDashboard()
      for (const key of dashboardCollections) expect(data[key]).toEqual([])
      expect(data.warehouses).toEqual([])
    } finally {
      await database.agencyMembership.create({ data: { membershipId: fixture.member.id, agencyId: fixture.agency.id } })
    }
  })
  it("reads the public demo without mutation, repair or audit", async () => {
    const before = await fixture.snapshot()
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    expect(ids(await getOperationsDashboard(), "sites")).toContain(fixture.site.id)
    expect(await fixture.snapshot()).toEqual(before)
  })
  it("refuses a suspended reader before accessing the dashboard", async () => {
    await database.membership.update({ where: { id: fixture.member.id }, data: { status: "SUSPENDED" } })
    await expect(getOperationsDashboard()).rejects.toThrow("plus accès")
  })
})
