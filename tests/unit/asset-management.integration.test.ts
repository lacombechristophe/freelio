import { createDatabaseClient } from "@/lib/database-client"
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createOperationsDashboardFixture } from "../helpers/operations-dashboard-fixture"

const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import prisma from "@/lib/prisma"
import { withAuth } from "@/lib/auth-wrapper"
import { lockActiveSite, lockActiveEquipment } from "@/lib/operations/asset-lifecycle"
import { updateCustomerSite, updateEquipment, setCustomerSiteActive, setEquipmentActive } from "@/actions/asset-management"

const db = createDatabaseClient()
describe.sequential("site and equipment lifecycle on isolated SQL", () => {
  let fixture: Awaited<ReturnType<typeof createOperationsDashboardFixture>>
  const site = () => db.customerSite.findUniqueOrThrow({ where: { id: fixture.site.id } })
  const equipment = () => db.equipment.findUniqueOrThrow({ where: { id: fixture.positive.equipments } })
  async function siteInput(extra: Record<string, unknown> = {}) {
    const row = await site()
    return { siteId: row.id, expectedUpdatedAt: row.updatedAt.toISOString(), label: row.label, kind: row.kind, address1: row.address1,
      address2: row.address2, postalCode: row.postalCode, city: row.city, country: row.country, accessNotes: row.accessNotes,
      latitude: row.latitude, longitude: row.longitude, ...extra }
  }
  async function equipmentInput(extra: Record<string, unknown> = {}) {
    const row = await equipment()
    return { equipmentId: row.id, expectedUpdatedAt: row.updatedAt.toISOString(), label: row.label, category: row.category, manufacturer: row.manufacturer,
      model: row.model, serialNumber: row.serialNumber, productId: row.productId, installedAt: row.installedAt?.toISOString() ?? null,
      warrantyUntil: row.warrantyUntil?.toISOString() ?? null, notes: row.notes, ...extra }
  }
  const siteActivity = async (active: boolean, extra: Record<string, unknown> = {}) => setCustomerSiteActive({ id: fixture.site.id, active, expectedUpdatedAt: (await site()).updatedAt.toISOString(), ...extra })
  const equipmentActivity = async (active: boolean, extra: Record<string, unknown> = {}) => setEquipmentActive({ id: fixture.positive.equipments, active, expectedUpdatedAt: (await equipment()).updatedAt.toISOString(), ...extra })
  async function finishSiteWork() {
    const siteId = fixture.site.id
    await db.equipment.updateMany({ where: { siteId }, data: { archivedAt: new Date() } })
    await db.project.updateMany({ where: { siteId }, data: { status: "COMPLETED" } })
    await db.serviceTicket.updateMany({ where: { siteId }, data: { status: "CLOSED" } })
    await db.fieldIntervention.updateMany({ where: { siteId }, data: { status: "COMPLETED" } })
    await db.maintenanceContract.updateMany({ where: { siteId }, data: { status: "EXPIRED" } })
  }
  async function finishEquipmentWork() {
    await db.fieldIntervention.updateMany({ where: { OR: [{ ticket: { equipmentId: fixture.positive.equipments } },
      { maintenanceContract: { equipments: { some: { equipmentId: fixture.positive.equipments } } } }] }, data: { status: "COMPLETED" } })
    await db.serviceTicket.updateMany({ where: { equipmentId: fixture.positive.equipments }, data: { status: "CLOSED" } })
    await db.maintenanceContract.updateMany({ where: { equipments: { some: { equipmentId: fixture.positive.equipments } } }, data: { status: "EXPIRED" } })
  }
  async function snapshot() {
    const where = { companyId: { in: [fixture.companyId, fixture.foreignCompanyId] } }
    return Promise.all([fixture.snapshot(), db.customerSite.findMany({ where, orderBy: { id: "asc" } }), db.equipment.findMany({ where, orderBy: { id: "asc" } })])
  }
  beforeEach(async () => { fixture = await createOperationsDashboardFixture(db); session.companyId = fixture.companyId; session.userId = fixture.user.id })
  afterEach(async () => { vi.unstubAllEnvs(); vi.restoreAllMocks(); if (fixture) { await db.auditLog.deleteMany({ where: { userId: fixture.user.id } }); await fixture.cleanup() } })
  afterAll(async () => { await db.$disconnect() })
  it("edits site coordinates without reparenting its histories", async () => {
    const history = await fixture.snapshot()
    await updateCustomerSite(await siteInput({ address1: " New fictional address ", address2: " ", latitude: "48.5", longitude: "" }))
    expect(await site()).toMatchObject({ address1: "New fictional address", address2: null, latitude: 48.5, longitude: null, clientId: fixture.site.clientId, agencyId: fixture.agency.id })
    expect((await fixture.snapshot()).slice(1, 10)).toEqual(history.slice(1, 10))
    expect(await db.auditLog.count({ where: { userId: fixture.user.id } })).toBe(1)
  })
  it("edits equipment metadata and dates while preserving its site, status and histories", async () => {
    const before = await equipment(), history = await fixture.snapshot()
    await updateEquipment(await equipmentInput({ serialNumber: " NEW-SERIAL ", notes: " ", installedAt: "2032-02-29T00:00:00.000Z" }))
    expect(await equipment()).toMatchObject({ serialNumber: "NEW-SERIAL", notes: null, installedAt: new Date("2032-02-29T00:00:00.000Z"), siteId: before.siteId, status: before.status })
    expect((await fixture.snapshot()).slice(2, 10)).toEqual(history.slice(2, 10))
  })
  it.each([{ latitude: 91 }, { longitude: -181 }, { latitude: "invalid" }, { latitude: true }, { latitude: undefined }])("refuses invalid coordinates %j atomically", async values => {
    const before = await snapshot()
    await expect(updateCustomerSite(await siteInput(values))).rejects.toThrow()
    expect(await snapshot()).toEqual(before)
  })
  it.each(["2030-02-31T00:00:00.000Z", "invalid"])("refuses invalid equipment date %s without losing metadata", async installedAt => {
    const before = await snapshot()
    await expect(updateEquipment(await equipmentInput({ installedAt }))).rejects.toThrow()
    expect(await snapshot()).toEqual(before)
  })
  it("refuses a duplicate serial number and rolls back its other fields", async () => {
    await db.equipment.update({ where: { id: fixture.optionalEquipment.id }, data: { serialNumber: "EXISTING" } })
    const before = await snapshot()
    await expect(updateEquipment(await equipmentInput({ serialNumber: "EXISTING", label: "Lost metadata" }))).rejects.toThrow("existe déjà")
    expect(await snapshot()).toEqual(before)
  })
  it("refuses stale edits and activity changes without additional audits", async () => {
    const oldSite = (await site()).updatedAt.toISOString(), oldEquipment = (await equipment()).updatedAt.toISOString()
    await updateCustomerSite(await siteInput({ label: "Saved site" }))
    await updateEquipment(await equipmentInput({ label: "Saved equipment" }))
    const before = await snapshot()
    await expect(updateCustomerSite(await siteInput({ expectedUpdatedAt: oldSite }))).rejects.toThrow("a changé")
    await expect(updateEquipment(await equipmentInput({ expectedUpdatedAt: oldEquipment }))).rejects.toThrow("a changé")
    await expect(siteActivity(false, { expectedUpdatedAt: oldSite })).rejects.toThrow("a changé")
    await expect(equipmentActivity(false, { expectedUpdatedAt: oldEquipment })).rejects.toThrow("a changé")
    expect(await snapshot()).toEqual(before)
  })
  it.each(["clientId", "agencyId", "companyId", "archivedAt"])("does not accept injected site field %s", async field => {
    const before = await snapshot()
    await expect(updateCustomerSite(await siteInput({ [field]: fixture.foreignAgency.id }))).rejects.toThrow()
    expect(await snapshot()).toEqual(before)
  })
  it.each(["siteId", "status", "companyId", "archivedAt"])("does not accept injected equipment field %s", async field => {
    const before = await snapshot()
    await expect(updateEquipment(await equipmentInput({ [field]: fixture.otherSite.id }))).rejects.toThrow()
    expect(await snapshot()).toEqual(before)
  })
  it("preserves a retained inactive product but rejects a new inactive assignment", async () => {
    const row = await equipment()
    await db.product.update({ where: { id: row.productId! }, data: { active: false } })
    await updateEquipment(await equipmentInput({ notes: "Retained historical product" }))
    const inactive = await db.product.create({ data: { companyId: fixture.companyId, sku: "INACTIVE", label: "Fictional inactive product", active: false } })
    const before = await snapshot()
    await expect(updateEquipment(await equipmentInput({ productId: inactive.id }))).rejects.toThrow("inactif")
    expect(await snapshot()).toEqual(before)
  })
  it("accepts a new coherent active product without changing its metadata revision", async () => {
    const product = await db.product.create({ data: { companyId: fixture.companyId, sku: "NEW", label: "Fictional new product" } })
    await updateEquipment(await equipmentInput({ productId: product.id }))
    expect((await equipment()).productId).toBe(product.id)
    expect((await db.product.findUniqueOrThrow({ where: { id: product.id } })).updatedAt).toEqual(product.updatedAt)
  })
  it.each(["equipment", "project", "ticket", "intervention", "contract", "foreign child"])("refuses site deactivation while %s remains active", async kind => {
    await finishSiteWork()
    if (kind === "equipment" || kind === "foreign child") await db.equipment.update({ where: { id: kind === "equipment" ? fixture.positive.equipments : fixture.foreignEquipment.id }, data: { archivedAt: null } })
    if (kind === "project") await db.project.update({ where: { id: fixture.project.id }, data: { status: "ACTIVE" } })
    if (kind === "ticket") await db.serviceTicket.update({ where: { id: fixture.ticket.id }, data: { status: "OPEN" } })
    if (kind === "intervention") await db.fieldIntervention.update({ where: { id: fixture.positive.interventions }, data: { status: "PLANNED" } })
    if (kind === "contract") await db.maintenanceContract.update({ where: { id: fixture.positive.contracts }, data: { status: "ACTIVE" } })
    const before = await snapshot()
    await expect(siteActivity(false)).rejects.toThrow("dossier en cours")
    expect(await snapshot()).toEqual(before)
  })
  it("deactivates and reactivates a finished site without deleting its histories", async () => {
    await finishSiteWork()
    const history = await fixture.snapshot()
    await siteActivity(false)
    expect((await site()).archivedAt).toBeInstanceOf(Date)
    await siteActivity(true)
    expect((await site()).archivedAt).toBeNull()
    expect((await fixture.snapshot()).slice(1, 10)).toEqual(history.slice(1, 10))
  })
  it.each(["ticket", "contract", "intervention"])("refuses equipment deactivation with an open %s", async kind => {
    await finishEquipmentWork()
    if (kind === "ticket") await db.serviceTicket.update({ where: { id: fixture.ticket.id }, data: { status: "OPEN" } })
    if (kind === "contract") await db.maintenanceContract.update({ where: { id: fixture.positive.contracts }, data: { status: "ACTIVE" } })
    if (kind === "intervention") await db.fieldIntervention.update({ where: { id: fixture.positive.interventions }, data: { status: "PLANNED" } })
    const before = await snapshot()
    await expect(equipmentActivity(false)).rejects.toThrow("dossier SAV ou un contrat")
    expect(await snapshot()).toEqual(before)
  })
  it("preserves an unknown imported technical status through deactivation and reactivation", async () => {
    await finishEquipmentWork()
    await db.equipment.update({ where: { id: fixture.positive.equipments }, data: { status: "EN_REPARATION" } })
    await equipmentActivity(false)
    expect(await equipment()).toMatchObject({ status: "EN_REPARATION", archivedAt: expect.any(Date) })
    await equipmentActivity(true)
    expect(await equipment()).toMatchObject({ status: "EN_REPARATION", archivedAt: null })
  })
  it("refuses equipment reactivation on a deactivated site", async () => {
    await finishEquipmentWork(); await equipmentActivity(false)
    await db.customerSite.update({ where: { id: fixture.site.id }, data: { archivedAt: new Date() } })
    const before = await snapshot()
    await expect(equipmentActivity(true)).rejects.toThrow("Site client introuvable ou désactivé")
    expect(await snapshot()).toEqual(before)
  })
  it.each(["foreign client", "foreign agency", "inaccessible agency"])("refuses site edits and activity changes with a %s", async kind => {
    let siteId = fixture.negative.sites
    if (kind === "foreign agency") {
      siteId = fixture.site.id
      await db.customerSite.update({ where: { id: siteId }, data: { agencyId: fixture.foreignAgency.id } })
    }
    if (kind === "inaccessible agency") {
      siteId = fixture.otherSite.id
      await db.membership.update({ where: { id: fixture.member.id }, data: { role: "SALES" } })
    }
    const before = await snapshot()
    await expect(updateCustomerSite(await siteInput({ siteId }))).rejects.toThrow("Site client introuvable")
    await expect(siteActivity(false, { id: siteId })).rejects.toThrow("Site client introuvable")
    expect(await snapshot()).toEqual(before)
  })
  it.each(["foreign site client", "foreign product", "foreign company", "inaccessible agency"])("refuses equipment edits and activity changes with a %s", async kind => {
    let equipmentId = kind === "foreign product" ? fixture.extra[0].id : kind === "foreign company" ? fixture.foreignEquipment.id : fixture.negative.equipments
    if (kind === "inaccessible agency") {
      equipmentId = (await db.equipment.create({ data: { companyId: fixture.companyId, siteId: fixture.otherSite.id, label: "Fictional other agency equipment" } })).id
      await db.membership.update({ where: { id: fixture.member.id }, data: { role: "TECHNICIAN" } })
    }
    const before = await snapshot()
    await expect(updateEquipment(await equipmentInput({ equipmentId }))).rejects.toThrow("Équipement introuvable")
    await expect(equipmentActivity(false, { id: equipmentId })).rejects.toThrow("Équipement introuvable")
    expect(await snapshot()).toEqual(before)
  })
  it("refuses reactivation when the site's agency has been deactivated", async () => {
    await finishSiteWork(); await siteActivity(false)
    await db.agency.update({ where: { id: fixture.agency.id }, data: { active: false } })
    const before = await snapshot()
    await expect(siteActivity(true)).rejects.toThrow("Agence introuvable ou inactive")
    expect(await snapshot()).toEqual(before)
  })
  it("locks references for Operations and Service without granting metadata write permissions", async () => {
    const before = await snapshot()
    await db.membership.update({ where: { id: fixture.member.id }, data: { role: "OPERATIONS" } })
    await withAuth(context => prisma.$transaction(tx => lockActiveSite(tx, context.companyId, fixture.site.id, context.agencyIds)), "operations.write")
    await expect(withAuth(() => prisma.customerSite.updateMany({ where: { id: fixture.site.id }, data: { label: "Unauthorized metadata" } }), "operations.write")).rejects.toThrow("crm.write")
    await db.membership.update({ where: { id: fixture.member.id }, data: { role: "SERVICE" } })
    await withAuth(context => prisma.$transaction(async tx => {
      await lockActiveSite(tx, context.companyId, fixture.site.id, context.agencyIds)
      await lockActiveEquipment(tx, context.companyId, fixture.site.id, [fixture.positive.equipments], context.agencyIds)
    }), "service.write")
    await expect(withAuth(() => prisma.equipment.updateMany({ where: { id: fixture.positive.equipments }, data: { label: "Unauthorized metadata" } }), "service.write")).rejects.toThrow("operations.write")
    expect(await snapshot()).toEqual(before)
  })
  it("permits site metadata for Sales while keeping equipment mutations unavailable", async () => {
    await db.membership.update({ where: { id: fixture.member.id }, data: { role: "SALES" } })
    await updateCustomerSite(await siteInput({ label: "Sales corrected site" }))
    await expect(updateEquipment(await equipmentInput())).rejects.toThrow("droits")
  })
  it("denies metadata edits for suspended memberships", async () => {
    await db.membership.update({ where: { id: fixture.member.id }, data: { status: "SUSPENDED" } })
    await expect(updateCustomerSite(await siteInput())).rejects.toThrow("plus accès")
    await expect(updateEquipment(await equipmentInput())).rejects.toThrow("plus accès")
    await expect(siteActivity(false)).rejects.toThrow("plus accès")
    await expect(equipmentActivity(false)).rejects.toThrow("plus accès")
  })
  it("denies all lifecycle writes in the public demo", async () => {
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    const before = await snapshot()
    await expect(updateCustomerSite(await siteInput())).rejects.toThrow("lecture seule")
    await expect(updateEquipment(await equipmentInput())).rejects.toThrow("lecture seule")
    await expect(siteActivity(false)).rejects.toThrow("lecture seule")
    await expect(equipmentActivity(false)).rejects.toThrow("lecture seule")
    expect(await snapshot()).toEqual(before)
  })
  it("allows only one concurrent edit for a captured equipment revision", async () => {
    const input = await equipmentInput()
    const results = await Promise.allSettled([updateEquipment({ ...input, label: "First edit" }), updateEquipment({ ...input, label: "Second edit" })])
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1)
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1)
    expect(await db.auditLog.count({ where: { userId: fixture.user.id } })).toBe(1)
  })
})
