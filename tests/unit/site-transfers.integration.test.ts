import { randomUUID } from "node:crypto"
import { PrismaClient } from "@prisma/client"
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import prisma from "@/lib/prisma"
import { withAuth } from "@/lib/auth-wrapper"
import { getSiteTransferChoices, transferCustomerSite } from "@/actions/site-transfers"
import { getCustomerSiteDirectory, getEquipmentDirectory } from "@/actions/operations-assets"

const db = new PrismaClient()
describe.sequential("entire site dossier transfer between agencies", () => {
  let companyId: string, foreignCompanyId: string, userId: string, memberId: string, sourceId: string, destinationId: string,
    foreignAgencyId: string, siteId: string, otherSiteId: string, projectId: string, equipmentId: string, clientId: string
  beforeEach(async () => {
    companyId = (await db.company.create({ data: { name: "Fictional site transfer" } })).id
    foreignCompanyId = (await db.company.create({ data: { name: "Foreign fictional company" } })).id
    userId = (await db.user.create({ data: { companyId, email: `${randomUUID()}@example.test` } })).id
    memberId = (await db.membership.create({ data: { companyId, userId, role: "OWNER", status: "ACTIVE" } })).id
    sourceId = (await db.agency.create({ data: { companyId, code: "SOURCE", name: "Fictional source" } })).id
    destinationId = (await db.agency.create({ data: { companyId, code: "DESTINATION", name: "Fictional destination" } })).id
    foreignAgencyId = (await db.agency.create({ data: { companyId: foreignCompanyId, code: "FOREIGN", name: "Foreign fictional agency" } })).id
    await db.agencyMembership.create({ data: { membershipId: memberId, agencyId: sourceId } })
    clientId = (await db.client.create({ data: { companyId, name: "Fictional client" } })).id
    siteId = (await db.customerSite.create({ data: { companyId, clientId, agencyId: sourceId, label: "Fictional site", address1: "Fictional address" } })).id
    otherSiteId = (await db.customerSite.create({ data: { companyId, clientId, agencyId: sourceId, label: "Fictional second site", address1: "Fictional address" } })).id
    projectId = (await db.project.create({ data: { companyId, clientId, siteId, agencyId: sourceId, name: "Fictional historical project", status: "COMPLETED" } })).id
    equipmentId = (await db.equipment.create({ data: { companyId, siteId, label: "Fictional historical equipment", status: "CUSTOM_IMPORTED_STATUS" } })).id
    const ticket = await db.serviceTicket.create({ data: { companyId, clientId, siteId, equipmentId, number: "SAV-1", title: "Fictional history", description: "Historical service" } })
    const contract = await db.maintenanceContract.create({ data: { companyId, clientId, siteId, number: "ENT-1", label: "Fictional maintenance",
      startDate: new Date("2030-01-02"), equipments: { create: { equipmentId } } } })
    await db.fieldIntervention.create({ data: { companyId, siteId, projectId, ticketId: ticket.id, maintenanceContractId: contract.id,
      title: "Fictional intervention", scheduledStart: new Date("2030-01-02") } })
    await db.invoice.create({ data: { companyId, clientId, projectId, number: "FACT-1", object: "Fictional issued archive", status: "SENT", lockedAt: new Date("2030-01-02"),
      dueDate: new Date("2030-02-02"), totalHtCents: 1000, totalTvaCents: 200, totalTtcCents: 1200,
      pdfUrl: "/api/files/fictional-archive.pdf", pdfHash: "a".repeat(64), issuedDocument: "Fictional immutable snapshot" } })
    session.companyId = companyId; session.userId = userId
  })
  afterEach(async () => {
    vi.unstubAllEnvs(); vi.restoreAllMocks()
    const where = { companyId: { in: [companyId, foreignCompanyId] } }
    await db.auditLog.deleteMany({ where: { userId } })
    await db.invoice.deleteMany({ where }); await db.fieldIntervention.deleteMany({ where })
    await db.serviceTicket.deleteMany({ where }); await db.maintenanceContract.deleteMany({ where }); await db.equipment.deleteMany({ where })
    await db.project.deleteMany({ where }); await db.customerSite.deleteMany({ where }); await db.client.deleteMany({ where })
    await db.company.deleteMany({ where: { id: where.companyId } }); await db.user.deleteMany({ where: { id: userId } })
  })
  afterAll(async () => { await db.$disconnect() })
  async function input(extra: Record<string, unknown> = {}) {
    const site = await db.customerSite.findUniqueOrThrow({ where: { id: siteId } })
    return { siteId, agencyId: destinationId, expectedUpdatedAt: site.updatedAt.toISOString(), reason: "Fictional complete dossier reassignment", confirmed: true, ...extra }
  }
  async function snapshot() {
    const where = { companyId: { in: [companyId, foreignCompanyId] } }
    return Promise.all([db.customerSite.findMany({ where, orderBy: { id: "asc" } }), db.project.findMany({ where, orderBy: { id: "asc" } }),
      db.equipment.findMany({ where, orderBy: { id: "asc" } }), db.serviceTicket.findMany({ where, orderBy: { id: "asc" } }),
      db.fieldIntervention.findMany({ where, orderBy: { id: "asc" } }), db.maintenanceContract.findMany({ where, orderBy: { id: "asc" } }),
      db.invoice.findMany({ where, orderBy: { id: "asc" } }), db.auditLog.count({ where: { userId } })])
  }
  it.each(["OWNER", "ADMIN"])("transfers the entire dossier for %s with one audit and unchanged historical content", async role => {
    await db.membership.update({ where: { id: memberId }, data: { role } })
    const before = await snapshot()
    await expect(transferCustomerSite(await input())).resolves.toEqual({ success: true })
    expect((await db.customerSite.findUniqueOrThrow({ where: { id: siteId } })).agencyId).toBe(destinationId)
    expect((await db.project.findUniqueOrThrow({ where: { id: projectId } })).agencyId).toBe(destinationId)
    expect((await db.customerSite.findUniqueOrThrow({ where: { id: otherSiteId } })).agencyId).toBe(sourceId)
    expect((await snapshot()).slice(2, 7)).toEqual(before.slice(2, 7))
    expect(await db.auditLog.findMany({ where: { userId } })).toMatchObject([{ action: "TRANSFER_CUSTOMER_SITE", resourceId: siteId,
      payload: { fromAgencyId: sourceId, toAgencyId: destinationId, projectCount: 1, policy: "ENTIRE_SITE_HISTORY" } }])
  })
  it("revokes the former agency's history and grants the destination's history without widening domain rights", async () => {
    await transferCustomerSite(await input())
    await db.membership.update({ where: { id: memberId }, data: { role: "ACCOUNTING" } })
    expect((await getCustomerSiteDirectory()).items.map(row => row.id)).not.toContain(siteId)
    expect((await getEquipmentDirectory()).items.map(row => row.id)).not.toContain(equipmentId)
    expect(await withAuth(() => prisma.invoice.count({ where: { projectId } }), "finance.read")).toBe(0)
    await db.agencyMembership.updateMany({ where: { membershipId: memberId }, data: { agencyId: destinationId } })
    expect((await getCustomerSiteDirectory()).items.map(row => row.id)).toContain(siteId)
    expect((await getEquipmentDirectory()).items.map(row => row.id)).toContain(equipmentId)
    expect(await withAuth(() => prisma.invoice.count({ where: { projectId } }), "finance.read")).toBe(1)
    await db.membership.update({ where: { id: memberId }, data: { role: "TECHNICIAN" } })
    await expect(withAuth(() => prisma.invoice.count(), "finance.read")).rejects.toThrow("droits")
  })
  it.each(["inactive", "foreign", "missing"])("refuses an %s destination with no mutation or audit", async kind => {
    if (kind === "inactive") await db.agency.update({ where: { id: destinationId }, data: { active: false } })
    const before = await snapshot()
    await expect(transferCustomerSite(await input({ agencyId: kind === "foreign" ? foreignAgencyId : kind === "missing" ? "cmissingagency0000000000000" : destinationId }))).rejects.toThrow("Agence destinataire introuvable ou inactive")
    expect(await snapshot()).toEqual(before)
  })
  it.each(["SALES", "OPERATIONS", "TECHNICIAN", "SERVICE", "ACCOUNTING", "VIEWER"])("denies %s before transfer and administrative reads", async role => {
    const request = await input(), before = await snapshot()
    await db.membership.update({ where: { id: memberId }, data: { role } })
    await expect(transferCustomerSite(request)).rejects.toThrow("droits")
    await expect(getSiteTransferChoices({ siteId })).rejects.toThrow("droits")
    expect(await snapshot()).toEqual(before)
  })
  it.each(["foreign child", "shared project", "shared equipment"])("refuses a dossier with %s without moving any history", async kind => {
    if (kind === "foreign child") await db.equipment.create({ data: { companyId: foreignCompanyId, siteId, label: "Foreign fictional child" } })
    if (kind === "shared project") await db.fieldIntervention.create({ data: { companyId, siteId: otherSiteId, projectId,
      title: "Fictional shared project", scheduledStart: new Date("2031-01-02") } })
    if (kind === "shared equipment") await db.serviceTicket.create({ data: { companyId, clientId, siteId: otherSiteId, equipmentId,
      number: "SHARED", title: "Fictional shared equipment", description: "Fictional request" } })
    const before = await snapshot()
    await expect(transferCustomerSite(await input())).rejects.toThrow("référence incohérente ou partagée")
    expect(await snapshot()).toEqual(before)
  })
  it("refuses a stale site revision and preserves the legitimate edit", async () => {
    const request = await input()
    await db.customerSite.update({ where: { id: siteId }, data: { label: "Fictional legitimate correction", updatedAt: new Date(Date.parse(request.expectedUpdatedAt) + 1000) } })
    const before = await snapshot()
    await expect(transferCustomerSite(request)).rejects.toThrow("Ce site a changé")
    expect(await snapshot()).toEqual(before)
  })
  it.each([{ confirmed: false }, { reason: " " }, { companyId: "override" }, { agencyId: null }])("rejects incomplete or injected input %j", async extra => {
    const before = await snapshot()
    await expect(transferCustomerSite(await input(extra))).rejects.toThrow()
    expect(await snapshot()).toEqual(before)
  })
  it("refuses all transfers in the public demo", async () => {
    const request = await input(), before = await snapshot()
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    await expect(transferCustomerSite(request)).rejects.toThrow("lecture seule")
    expect(await snapshot()).toEqual(before)
  })
  it("retains the chosen active destination outside its search page and excludes other tenants", async () => {
    await db.agency.createMany({ data: Array.from({ length: 51 }, (_, i) => ({ companyId, code: `PAGE-${i}`, name: `Fictional agency ${String(i).padStart(3, "0")}` })) })
    const result = await getSiteTransferChoices({ siteId, search: "Fictional agency", page: 3, selectedId: destinationId })
    expect(result).toMatchObject({ total: 51, page: 3, items: [expect.anything()], selected: { id: destinationId } })
    expect((await getSiteTransferChoices({ siteId, selectedId: foreignAgencyId })).selected).toBeNull()
    expect((await getSiteTransferChoices({ siteId, selectedId: sourceId })).selected).toBeNull()
    for (const item of [...result.items, result.selected!]) expect(Object.keys(item).sort()).toEqual(["id", "label"])
  })
  it("allows only one transfer of a captured revision", async () => {
    const request = await input()
    const results = await Promise.allSettled([transferCustomerSite(request), transferCustomerSite(request)])
    expect(results.filter(row => row.status === "fulfilled")).toHaveLength(1)
    expect(await db.auditLog.count({ where: { userId } })).toBe(1)
  })
  it("moves all 302 linked projects without a page cap and preserves an archived site's activity", async () => {
    await db.project.createMany({ data: Array.from({ length: 301 }, (_, i) => ({ companyId, clientId, siteId, agencyId: sourceId,
      name: `Fictional old project ${i}`, status: "ARCHIVED" })) })
    const archivedAt = new Date("2030-01-02")
    await db.customerSite.update({ where: { id: siteId }, data: { archivedAt } })
    await transferCustomerSite(await input())
    expect(await db.project.count({ where: { companyId, siteId, agencyId: destinationId } })).toBe(302)
    expect((await db.customerSite.findUniqueOrThrow({ where: { id: siteId } })).archivedAt).toEqual(archivedAt)
    expect((await db.auditLog.findFirstOrThrow({ where: { userId } })).payload).toMatchObject({ projectCount: 302 })
  })
  it.each(["company", "client", "agency"] as const)("refuses a site with a foreign %s before any transfer", async kind => {
    if (kind === "company") await db.customerSite.update({ where: { id: siteId }, data: { companyId: foreignCompanyId } })
    if (kind === "client") {
      const client = await db.client.create({ data: { companyId: foreignCompanyId, name: "Foreign fictional client" } })
      await db.customerSite.update({ where: { id: siteId }, data: { clientId: client.id } })
    }
    if (kind === "agency") await db.customerSite.update({ where: { id: siteId }, data: { agencyId: foreignAgencyId } })
    const before = await snapshot()
    await expect(transferCustomerSite(await input())).rejects.toThrow("Site client introuvable")
    expect(await snapshot()).toEqual(before)
  })
  it("rechecks suspended membership before administrative reads or writes", async () => {
    const request = await input(), before = await snapshot()
    await db.membership.update({ where: { id: memberId }, data: { status: "SUSPENDED" } })
    await expect(transferCustomerSite(request)).rejects.toThrow("plus accès")
    await expect(getSiteTransferChoices({ siteId })).rejects.toThrow("plus accès")
    expect(await snapshot()).toEqual(before)
  })
})
