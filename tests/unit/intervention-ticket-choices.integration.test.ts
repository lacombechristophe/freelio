import { createDatabaseClient } from "@/lib/database-client"
import { randomUUID } from "node:crypto"
import { type Prisma } from "@/generated/prisma/client"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ userId: "", companyId: "", authenticated: true }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => session.authenticated ? { user: { id: session.userId }, companyId: session.companyId } : null }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import { getAssetTicketChoices } from "@/actions/asset-choices"
import { requestContext } from "@/lib/context"

const db = createDatabaseClient()

describe.sequential("New intervention ticket choices reach the complete compatible portfolio", () => {
  let membershipId: string, agencyId: string, otherAgencyId: string, clientId: string, otherClientId: string
  let siteId: string, otherSiteId: string, otherAgencySiteId: string, firstTicketId: string, lastTicketId: string
  let foreignCompanyId: string, foreignUserId: string, foreignMembershipId: string, foreignClientId: string, foreignSiteId: string
  let foreignProductId: string, foreignSupplierId: string
  const addedTicketIds: string[] = [], addedEquipmentIds: string[] = [], addedProductIds: string[] = []
  const ticketNumber = (index: number) => `FICTIONAL-${String(index).padStart(3, "0")}`
  const choices = (input: Record<string, unknown> = {}) => getAssetTicketChoices({ siteId, ...input })
  async function addTicket(data: Partial<Prisma.ServiceTicketUncheckedCreateInput> = {}) {
    const ticket = await db.serviceTicket.create({ data: { companyId: session.companyId, clientId, siteId, number: `CASE-${randomUUID()}`,
      title: "Fictional case ticket", description: "Fictional diagnostic", ...data } })
    addedTicketIds.push(ticket.id)
    return ticket
  }
  async function snapshot() {
    return Promise.all([
      db.serviceTicket.findMany({ where: { companyId: session.companyId }, orderBy: { id: "asc" } }),
      db.customerSite.findMany({ where: { companyId: session.companyId }, orderBy: { id: "asc" } }),
      db.fieldIntervention.count({ where: { companyId: session.companyId } }),
      db.auditLog.count({ where: { userId: session.userId } }),
    ])
  }
  beforeAll(async () => {
    session.companyId = (await db.company.create({ data: { name: "Fictional intervention ticket choices" } })).id
    session.userId = (await db.user.create({ data: { email: `ticket-choices-${randomUUID()}@example.test`, companyId: session.companyId } })).id
    membershipId = (await db.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    agencyId = (await db.agency.create({ data: { companyId: session.companyId, code: "CHOICE", name: "Fictional ticket choice agency" } })).id
    otherAgencyId = (await db.agency.create({ data: { companyId: session.companyId, code: "OTHER", name: "Fictional other agency" } })).id
    await db.agencyMembership.create({ data: { membershipId, agencyId } })
    clientId = (await db.client.create({ data: { companyId: session.companyId, name: "Fictional intervention client" } })).id
    otherClientId = (await db.client.create({ data: { companyId: session.companyId, name: "Fictional other client" } })).id
    siteId = (await db.customerSite.create({ data: { companyId: session.companyId, clientId, agencyId, label: "Fictional selected site", address1: "Fictional address A" } })).id
    otherSiteId = (await db.customerSite.create({ data: { companyId: session.companyId, clientId, agencyId, label: "Fictional other site", address1: "Fictional address B" } })).id
    otherAgencySiteId = (await db.customerSite.create({ data: { companyId: session.companyId, clientId, agencyId: otherAgencyId, label: "Fictional other agency site", address1: "Fictional address C" } })).id
    await db.serviceTicket.createMany({ data: Array.from({ length: 201 }, (_, index) => ({ companyId: session.companyId, clientId, siteId,
      number: ticketNumber(index), title: `Fictional eligible ticket ${String(index).padStart(3, "0")}`, description: "Fictional diagnostic" })) })
    firstTicketId = (await db.serviceTicket.findUniqueOrThrow({ where: { companyId_number: { companyId: session.companyId, number: ticketNumber(0) } } })).id
    lastTicketId = (await db.serviceTicket.findUniqueOrThrow({ where: { companyId_number: { companyId: session.companyId, number: ticketNumber(200) } } })).id
    foreignCompanyId = (await db.company.create({ data: { name: "FOREIGN-FICTIONAL-TICKET-COMPANY" } })).id
    foreignUserId = (await db.user.create({ data: { email: `foreign-ticket-choices-${randomUUID()}@example.test`, name: "FOREIGN-FICTIONAL-TICKET-MEMBER" } })).id
    foreignMembershipId = (await db.membership.create({ data: { companyId: foreignCompanyId, userId: foreignUserId, role: "TECHNICIAN", status: "ACTIVE" } })).id
    foreignClientId = (await db.client.create({ data: { companyId: foreignCompanyId, name: "FOREIGN-FICTIONAL-TICKET-CLIENT" } })).id
    foreignSiteId = (await db.customerSite.create({ data: { companyId: foreignCompanyId, clientId: foreignClientId, label: "FOREIGN-FICTIONAL-TICKET-SITE", address1: "Fictional foreign address" } })).id
    foreignProductId = (await db.product.create({ data: { companyId: foreignCompanyId, sku: "FOREIGN", label: "FOREIGN-FICTIONAL-TICKET-PRODUCT" } })).id
    foreignSupplierId = (await db.supplier.create({ data: { companyId: foreignCompanyId, name: "FOREIGN-FICTIONAL-TICKET-SUPPLIER" } })).id
  })
  afterEach(async () => {
    vi.restoreAllMocks(); vi.unstubAllEnvs(); session.authenticated = true
    await db.serviceTicket.deleteMany({ where: { id: { in: addedTicketIds.splice(0) } } })
    await db.equipment.deleteMany({ where: { id: { in: addedEquipmentIds.splice(0) } } })
    await db.product.deleteMany({ where: { id: { in: addedProductIds.splice(0) } } })
    await db.membership.update({ where: { id: membershipId }, data: { role: "OWNER", status: "ACTIVE" } })
    if (!await db.agencyMembership.findFirst({ where: { membershipId, agencyId } })) await db.agencyMembership.create({ data: { membershipId, agencyId } })
    await db.agency.update({ where: { id: agencyId }, data: { active: true } })
    await db.customerSite.update({ where: { id: siteId }, data: { archivedAt: null, clientId } })
    await db.serviceTicket.update({ where: { id: lastTicketId }, data: { clientId, siteId, status: "OPEN", mergedIntoTicketId: null, equipmentId: null, assignedMembershipId: null } })
  })
  afterAll(async () => {
    try {
      for (const companyId of [session.companyId, foreignCompanyId].filter(Boolean)) {
        await db.serviceTicket.deleteMany({ where: { companyId } })
        await db.equipment.deleteMany({ where: { companyId } })
        await db.customerSite.deleteMany({ where: { companyId } })
        await db.product.deleteMany({ where: { companyId } })
        await db.supplier.deleteMany({ where: { companyId } })
        await db.client.deleteMany({ where: { companyId } })
        await db.company.delete({ where: { id: companyId } })
      }
      await db.user.deleteMany({ where: { id: { in: [session.userId, foreignUserId].filter(Boolean) } } })
    } finally { await db.$disconnect() }
  })

  it("makes all 201 compatible tickets reachable through stable pages of 25", async () => {
    const ids: string[] = []
    for (let page = 1; page <= 9; page++) {
      const result = await choices({ page, selectedId: lastTicketId })
      expect(result).toMatchObject({ total: 201, page, selected: { id: lastTicketId } })
      expect(result.items).toHaveLength(page === 9 ? 1 : 25)
      for (const item of [...result.items, result.selected!]) expect(Object.keys(item).sort()).toEqual(["id", "label"])
      ids.push(...result.items.map(item => item.id))
    }
    expect(new Set(ids).size).toBe(201); expect(ids[0]).toBe(firstTicketId); expect(ids.at(-1)).toBe(lastTicketId)
  })
  it("finds the last ticket by number or title, independently of the dashboard cache", async () => {
    expect(await choices({ search: ticketNumber(200) })).toMatchObject({ total: 1, items: [{ id: lastTicketId }] })
    expect(await choices({ search: "eligible ticket 200" })).toMatchObject({ total: 1, items: [{ id: lastTicketId }] })
  })
  it("retains an eligible selection outside the current page and search", async () => {
    const result = await choices({ search: ticketNumber(0), selectedId: lastTicketId })
    expect(result).toMatchObject({ total: 1, page: 1, items: [{ id: firstTicketId }], selected: { id: lastTicketId, label: `${ticketNumber(200)} · Fictional eligible ticket 200` } })
    expect((await choices()).selected).toBeNull()
  })
  it("clamps an obsolete page after the result count changes", async () => {
    expect(await choices({ search: ticketNumber(200), page: 100_000 })).toMatchObject({ total: 1, page: 1, items: [{ id: lastTicketId }] })
    expect(await choices({ search: "Fictional nonexistent ticket", page: 100_000 })).toMatchObject({ total: 0, page: 1, items: [], selected: null })
  })
  it("allows a general ticket of the selected site's client for unrestricted roles", async () => {
    const ticket = await addTicket({ siteId: null })
    expect(await choices({ selectedId: ticket.id })).toMatchObject({ total: 202, selected: { id: ticket.id } })
  })
  it.each(["RESOLVED", "CLOSED"])("keeps the existing eligibility policy for a %s ticket", async status => {
    const ticket = await addTicket({ status })
    expect((await choices({ selectedId: ticket.id })).selected?.id).toBe(ticket.id)
  })
  it.each(["client", "site", "company"])("does not offer or retain a ticket of another %s", async kind => {
    const ticket = await addTicket(kind === "client" ? { clientId: otherClientId } : kind === "site" ? { siteId: otherSiteId }
      : { companyId: foreignCompanyId, clientId: foreignClientId, siteId: foreignSiteId })
    expect(await choices({ search: ticket.number, selectedId: ticket.id })).toMatchObject({ total: 0, items: [], selected: null })
    expect((await choices()).total).toBe(201)
  })
  it("excludes a ticket whose assignee belongs to another company", async () => {
    const ticket = await addTicket({ assignedMembershipId: foreignMembershipId })
    expect(await choices({ search: ticket.number, selectedId: ticket.id })).toMatchObject({ total: 0, items: [], selected: null })
  })
  it("allows a ticket with active equipment of the selected site", async () => {
    const equipment = await db.equipment.create({ data: { companyId: session.companyId, siteId, label: "Fictional eligible ticket equipment" } }); addedEquipmentIds.push(equipment.id)
    const ticket = await addTicket({ equipmentId: equipment.id })
    expect((await choices({ selectedId: ticket.id })).selected?.id).toBe(ticket.id)
  })
  it.each(["archived", "other-site", "foreign", "foreign-product", "foreign-supplier"])("does not offer a ticket with %s equipment", async kind => {
    let productId: string | undefined = kind === "foreign-product" ? foreignProductId : undefined
    if (kind === "foreign-supplier") {
      productId = (await db.product.create({ data: { companyId: session.companyId, sku: "INCOHERENT", label: "Fictional incoherent equipment product", supplierId: foreignSupplierId } })).id
      addedProductIds.push(productId)
    }
    const equipment = await db.equipment.create({ data: { companyId: kind === "foreign" ? foreignCompanyId : session.companyId,
      siteId: kind === "foreign" ? foreignSiteId : kind === "other-site" ? otherSiteId : siteId,
      label: "Fictional incompatible ticket equipment", archivedAt: kind === "archived" ? new Date() : null, productId } })
    addedEquipmentIds.push(equipment.id)
    const ticket = await addTicket({ equipmentId: equipment.id })
    expect(await choices({ search: ticket.number, selectedId: ticket.id })).toMatchObject({ total: 0, items: [], selected: null })
  })
  it.each(["MERGED", "pointer"])("excludes a ticket merged through its %s marker", async marker => {
    const ticket = await addTicket(marker === "MERGED" ? { status: "MERGED" } : { mergedIntoTicketId: firstTicketId })
    expect(await choices({ search: ticket.number, selectedId: ticket.id })).toMatchObject({ total: 0, items: [], selected: null })
  })
  it("stops retaining a selection after it becomes incompatible", async () => {
    expect((await choices({ selectedId: lastTicketId })).selected?.id).toBe(lastTicketId)
    await db.serviceTicket.update({ where: { id: lastTicketId }, data: { siteId: otherSiteId } })
    expect(await choices({ selectedId: lastTicketId })).toMatchObject({ total: 200, selected: null })
  })
  it.each(["archived", "inactive-agency", "foreign-client"])("refuses a selected site with an %s reference", async kind => {
    if (kind === "archived") await db.customerSite.update({ where: { id: siteId }, data: { archivedAt: new Date() } })
    else if (kind === "inactive-agency") await db.agency.update({ where: { id: agencyId }, data: { active: false } })
    else await db.customerSite.update({ where: { id: siteId }, data: { clientId: foreignClientId } })
    await expect(choices()).rejects.toThrow("Site introuvable ou inaccessible")
  })
  it("refuses a site belonging to another company without exposing its tickets", async () => {
    await expect(choices({ siteId: foreignSiteId })).rejects.toThrow("Site introuvable ou inaccessible")
  })
  it.each(["SALES", "OPERATIONS", "TECHNICIAN", "SERVICE", "ACCOUNTING", "VIEWER"])("preserves Operations read access for %s", async role => {
    await db.membership.update({ where: { id: membershipId }, data: { role } })
    expect(await choices({ selectedId: lastTicketId })).toMatchObject({ total: 201, selected: { id: lastTicketId } })
  })
  it("keeps existing agency restrictions for general tickets and other agencies", async () => {
    const general = await addTicket({ siteId: null }), otherAgency = await addTicket({ siteId: otherAgencySiteId })
    await db.membership.update({ where: { id: membershipId }, data: { role: "OPERATIONS" } })
    for (const selectedId of [general.id, otherAgency.id]) expect((await choices({ selectedId })).selected).toBeNull()
    expect((await choices()).total).toBe(201)
    await expect(choices({ siteId: otherAgencySiteId })).rejects.toThrow("Site introuvable ou inaccessible")
  })
  it("rechecks agency membership before returning another page or retained choice", async () => {
    await db.membership.update({ where: { id: membershipId }, data: { role: "OPERATIONS" } })
    expect((await choices({ selectedId: lastTicketId })).selected?.id).toBe(lastTicketId)
    await db.agencyMembership.deleteMany({ where: { membershipId, agencyId } })
    await expect(choices({ page: 2, selectedId: lastTicketId })).rejects.toThrow("Site introuvable ou inaccessible")
  })
  it("refuses a suspended membership before entering the business reader", async () => {
    await db.membership.update({ where: { id: membershipId }, data: { status: "SUSPENDED" } })
    const context = vi.spyOn(requestContext, "run")
    await expect(choices()).rejects.toThrow("plus accès"); expect(context).not.toHaveBeenCalled()
  })
  it("requires authentication before validating input or entering the business reader", async () => {
    session.authenticated = false
    const context = vi.spyOn(requestContext, "run")
    await expect(getAssetTicketChoices({ siteId: "invalid" })).rejects.toThrow("Authentification"); expect(context).not.toHaveBeenCalled()
  })
  it.each([{ siteId: undefined }, { siteId: "invalid" }, { siteId: "" }, { selectedId: "invalid" }, { page: 0 }, { page: -1 }, { page: 1.5 }, { page: 100_001 },
    { search: "x".repeat(201) }, { companyId: "override" }, { clientId: "override" }, { unknown: true }])("rejects invalid ticket-choice input %j", async input => {
    await expect(choices(input)).rejects.toThrow()
  })
  it("is readable in the public demo without modifying tickets, sites, interventions or audits", async () => {
    const before = await snapshot(); vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    expect(await choices({ search: ticketNumber(0), selectedId: lastTicketId })).toMatchObject({ total: 1, items: [{ id: firstTicketId }], selected: { id: lastTicketId } })
    expect(await snapshot()).toEqual(before)
  })
})
