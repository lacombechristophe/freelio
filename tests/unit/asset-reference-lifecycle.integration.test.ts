import { PrismaClient } from "@prisma/client"
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createOperationsDashboardFixture } from "../helpers/operations-dashboard-fixture"

const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import { createEquipment, createServiceTicket, createFieldIntervention, createMaintenanceContract, renewMaintenanceContract, getOperationsDashboard } from "@/actions/operations"
import { processDueMaintenanceVisits } from "@/lib/scheduling/business"

const db = new PrismaClient()
const commands = ["equipment", "ticket", "intervention", "maintenance"] as const
describe.sequential("new references recheck active sites and equipment", () => {
  let fixture: Awaited<ReturnType<typeof createOperationsDashboardFixture>>
  beforeEach(async () => { fixture = await createOperationsDashboardFixture(db); session.companyId = fixture.companyId; session.userId = fixture.user.id })
  afterEach(async () => { if (fixture) { await db.auditLog.deleteMany({ where: { userId: fixture.user.id } }); await fixture.cleanup() } })
  afterAll(async () => { await db.$disconnect() })
  function execute(command: typeof commands[number], withEquipment = false) {
    if (command === "equipment") return createEquipment({ siteId: fixture.site.id, label: "Fictional new equipment" })
    if (command === "ticket") return createServiceTicket({ clientId: fixture.site.clientId, siteId: fixture.site.id, title: "Fictional new ticket", description: "Fictional requested work",
      ...(withEquipment ? { equipmentId: fixture.positive.equipments } : {}) })
    if (command === "intervention") return createFieldIntervention({ siteId: fixture.site.id, title: "Fictional new visit", scheduledStart: "2031-01-05T14:00:00.000Z" })
    return createMaintenanceContract({ clientId: fixture.site.clientId, siteId: fixture.site.id, label: "Fictional new maintenance", startDate: "2031-01-05T00:00:00.000Z",
      ...(withEquipment ? { equipmentIds: [fixture.positive.equipments] } : {}) })
  }
  it.each(commands)("preserves a coherent %s creation", async command => {
    await expect(execute(command)).resolves.toMatchObject({ success: true })
  })
  it.each(commands)("refuses a new %s on a deactivated site", async command => {
    await db.customerSite.update({ where: { id: fixture.site.id }, data: { archivedAt: new Date() } })
    const before = await fixture.snapshot()
    await expect(execute(command)).rejects.toThrow("Site client introuvable ou désactivé")
    expect(await fixture.snapshot()).toEqual(before)
    expect(await db.equipment.count({ where: { companyId: fixture.companyId, label: "Fictional new equipment" } })).toBe(0)
  })
  it.each(["ticket", "maintenance"] as const)("refuses a new %s on deactivated equipment", async command => {
    await db.equipment.update({ where: { id: fixture.positive.equipments }, data: { archivedAt: new Date() } })
    const before = await fixture.snapshot()
    await expect(execute(command, true)).rejects.toThrow("Équipement introuvable, désactivé ou rattaché à un autre site")
    expect(await fixture.snapshot()).toEqual(before)
  })
  it("does not schedule a due maintenance visit on a deactivated site", async () => {
    await db.maintenanceContract.update({ where: { id: fixture.positive.contracts }, data: { nextVisitAt: new Date("2020-01-02T12:00:00Z") } })
    await db.customerSite.update({ where: { id: fixture.site.id }, data: { archivedAt: new Date() } })
    const before = await fixture.snapshot()
    await expect(processDueMaintenanceVisits({ companyId: fixture.companyId, userId: fixture.user.id })).resolves.toMatchObject({ examined: 1, scheduled: 0, failed: 1 })
    expect(await fixture.snapshot()).toEqual(before)
  })
  it.each(["foreign client", "foreign agency"])("refuses equipment creation through a site's %s", async kind => {
    const siteId = kind === "foreign client" ? fixture.negative.sites : fixture.site.id
    if (kind === "foreign agency") await db.customerSite.update({ where: { id: siteId }, data: { agencyId: fixture.foreignAgency.id } })
    const before = await fixture.snapshot()
    await expect(createEquipment({ siteId, label: "Fictional new equipment" })).rejects.toThrow("Site client introuvable ou désactivé")
    expect(await fixture.snapshot()).toEqual(before)
    expect(await db.equipment.count({ where: { companyId: fixture.companyId, label: "Fictional new equipment" } })).toBe(0)
  })
  it.each(["inactive", "foreign supplier"])("refuses equipment creation through an %s product", async kind => {
    const supplierId = (await db.supplier.findFirstOrThrow({ where: { companyId: fixture.foreignCompanyId } })).id
    const product = await db.product.create({ data: { companyId: fixture.companyId, sku: "BAD-REFERENCE", label: "Fictional invalid reference",
      ...(kind === "inactive" ? { active: false } : { supplierId }) } })
    const before = await fixture.snapshot()
    await expect(createEquipment({ siteId: fixture.site.id, productId: product.id, label: "Fictional new equipment" })).rejects.toThrow("Produit introuvable ou inactif")
    expect(await fixture.snapshot()).toEqual(before)
    expect(await db.equipment.count({ where: { companyId: fixture.companyId, label: "Fictional new equipment" } })).toBe(0)
  })
  it("refuses a duplicate serial number with a domain error and no second equipment", async () => {
    await db.equipment.update({ where: { id: fixture.positive.equipments }, data: { serialNumber: "EXISTING-SERIAL" } })
    const before = await fixture.snapshot()
    await expect(createEquipment({ siteId: fixture.site.id, label: "Fictional new equipment", serialNumber: "EXISTING-SERIAL" })).rejects.toThrow("Ce numéro de série existe déjà dans la société.")
    expect(await fixture.snapshot()).toEqual(before)
    expect(await db.equipment.count({ where: { companyId: fixture.companyId, label: "Fictional new equipment" } })).toBe(0)
  })
  async function renewable(autoInvoice = false) {
    return db.maintenanceContract.create({ data: { companyId: fixture.companyId, clientId: fixture.site.clientId, siteId: fixture.site.id,
      number: "RENEWABLE", label: "Fictional renewable maintenance", startDate: new Date("2030-01-02T00:00:00Z"), endDate: new Date("2031-01-02T00:00:00Z"),
      renewalStatus: "ACCEPTED", autoInvoice, equipments: { create: { equipmentId: fixture.positive.equipments } } } })
  }
  it.each(["OWNER", "TECHNICIAN"])("allows %s to renew an accessible term without automatic billing", async role => {
    const contract = await renewable()
    await db.membership.update({ where: { id: fixture.member.id }, data: { role } })
    await expect(renewMaintenanceContract(contract.id)).resolves.toMatchObject({ success: true })
    expect(await db.maintenanceContract.count({ where: { renewedFromId: contract.id } })).toBe(1)
  })
  it.each(["site", "equipment"] as const)("refuses renewal through inactive %s without changing the old term", async kind => {
    const contract = await renewable()
    if (kind === "site") await db.customerSite.update({ where: { id: fixture.site.id }, data: { archivedAt: new Date() } })
    else await db.equipment.update({ where: { id: fixture.positive.equipments }, data: { archivedAt: new Date() } })
    const before = await fixture.snapshot()
    await expect(renewMaintenanceContract(contract.id)).rejects.toThrow(kind === "site" ? "Site client introuvable ou désactivé" : "Équipement introuvable, désactivé ou rattaché à un autre site")
    expect(await fixture.snapshot()).toEqual(before)
  })
  it("requires Operations write before loading the term for renewal", async () => {
    await db.membership.update({ where: { id: fixture.member.id }, data: { role: "SERVICE" } })
    await expect(renewMaintenanceContract("not-an-id")).rejects.toThrow("droit Opérations en écriture")
  })
  it("requires Finance write before creating automatically billed maintenance", async () => {
    await db.membership.update({ where: { id: fixture.member.id }, data: { role: "TECHNICIAN" } })
    const before = await fixture.snapshot()
    await expect(createMaintenanceContract({ clientId: fixture.site.clientId, siteId: fixture.site.id, label: "Fictional automatic billing",
      startDate: "2031-01-02", priceCents: 1000, autoInvoice: true })).rejects.toThrow("droit Finance en écriture")
    expect(await fixture.snapshot()).toEqual(before)
  })
  it.each(["flag", "recurring"] as const)("requires Finance write for renewal with automatic billing from %s", async kind => {
    const contract = await renewable(kind === "flag")
    if (kind === "recurring") await db.recurringInvoice.create({ data: { companyId: fixture.companyId, clientId: fixture.site.clientId,
      maintenanceContractId: contract.id, label: "Fictional recurring term", frequency: "ANNUALLY", nextGenDate: new Date("2031-01-02"), template: {} } })
    await db.membership.update({ where: { id: fixture.member.id }, data: { role: "TECHNICIAN" } })
    const before = await fixture.snapshot()
    await expect(renewMaintenanceContract(contract.id)).rejects.toThrow("droit Finance en écriture")
    expect(await fixture.snapshot()).toEqual(before)
    const dashboard = await getOperationsDashboard()
    expect(dashboard.contracts.find(row => row.id === contract.id)?.canRenew).toBe(false)
  })
  it("preserves the automatic billing flag on the next term", async () => {
    const contract = await renewable(true)
    await renewMaintenanceContract(contract.id)
    expect(await db.maintenanceContract.findFirst({ where: { renewedFromId: contract.id } })).toMatchObject({ autoInvoice: true })
  })
})
