import { createDatabaseClient } from "@/lib/database-client"
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createOperationsDashboardFixture } from "../helpers/operations-dashboard-fixture"

const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import { getOperationsMaintenanceDirectory, renewMaintenanceContract } from "@/actions/operations"
import * as numbering from "@/lib/document-numbering"

const db = createDatabaseClient()
describe.sequential("Maintenance renewal freezes its displayed source and commits its whole billing transition", () => {
  let fixture: Awaited<ReturnType<typeof createOperationsDashboardFixture>>
  const current = () => db.maintenanceContract.findUniqueOrThrow({ where: { id: fixture.positive.contracts } })
  async function displayed() {
    const row = (await getOperationsMaintenanceDirectory()).items.find(item => item.id === fixture.positive.contracts)!
    return { id: row.id, revision: row.renewalRevision }
  }
  const snapshot = () => Promise.all([fixture.snapshot(), db.recurringInvoice.findMany({ where: { companyId: { in: [fixture.companyId, fixture.foreignCompanyId] } }, orderBy: { id: "asc" } }),
    db.maintenanceContractEquipment.findMany({ where: { contract: { companyId: { in: [fixture.companyId, fixture.foreignCompanyId] } } }, orderBy: [{ contractId: "asc" }, { equipmentId: "asc" }] })])
  beforeEach(async () => {
    fixture = await createOperationsDashboardFixture(db); session.userId = fixture.user.id; session.companyId = fixture.companyId
    await db.maintenanceContract.deleteMany({ where: { renewedFromId: fixture.positive.contracts } })
    await db.maintenanceContractEquipment.deleteMany({ where: { contractId: fixture.positive.contracts } })
    await db.maintenanceContractEquipment.create({ data: { contractId: fixture.positive.contracts, equipmentId: fixture.positive.equipments } })
    await db.maintenanceContract.update({ where: { id: fixture.positive.contracts }, data: { startDate: new Date("2030-01-01"), endDate: new Date("2030-12-31"),
      renewalStatus: "ACCEPTED", priceCents: 10000, indexationRate: 2, tvaRate: 20 } })
    await db.company.update({ where: { id: fixture.companyId }, data: { isTvaApplicable: true } })
  })
  async function dropTrigger() {
    if (process.env.DATABASE_URL?.startsWith("file:")) await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS "fictional_maintenance_term_audit_failure"')
    else { await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS "fictional_maintenance_term_audit_failure" ON "AuditLog"'); await db.$executeRawUnsafe('DROP FUNCTION IF EXISTS fictional_maintenance_term_audit_failure()') }
  }
  async function refuseAudit() {
    expect(session.userId).toMatch(/^[a-z0-9]+$/)
    if (process.env.DATABASE_URL?.startsWith("file:")) await db.$executeRawUnsafe(`CREATE TRIGGER "fictional_maintenance_term_audit_failure" BEFORE INSERT ON "AuditLog" WHEN NEW."userId" = '${session.userId}' BEGIN SELECT RAISE(ABORT, 'Fictional renewal audit failure'); END`)
    else {
      await db.$executeRawUnsafe(`CREATE FUNCTION fictional_maintenance_term_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."userId" = '${session.userId}' THEN RAISE EXCEPTION 'Fictional renewal audit failure'; END IF; RETURN NEW; END; $$`)
      await db.$executeRawUnsafe('CREATE TRIGGER "fictional_maintenance_term_audit_failure" BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION fictional_maintenance_term_audit_failure()')
    }
  }
  function duringPreparation(change: () => Promise<unknown>) {
    const read = numbering.readCompanyDocumentNumbers
    vi.spyOn(numbering, "readCompanyDocumentNumbers").mockImplementationOnce(async callback => { const value = await read(callback); await change(); return value })
  }
  afterEach(async () => {
    vi.restoreAllMocks(); vi.unstubAllEnvs(); await dropTrigger()
    if (fixture) { await db.auditLog.deleteMany({ where: { userId: fixture.user.id } }); await fixture.cleanup() }
  })
  afterAll(async () => { await db.$disconnect() })

  it("creates one coherent term, moves active billing and keeps one audit", async () => {
    const source = await displayed(), result = await renewMaintenanceContract(source.id, source.revision)
    expect(await db.maintenanceContract.findUniqueOrThrow({ where: { id: result.id } })).toMatchObject({ renewedFromId: source.id, priceCents: 10200, tvaRate: 20, renewalStatus: "NOT_DUE" })
    expect(await current()).toMatchObject({ status: "RENEWED", renewalStatus: "RENEWED", nextVisitAt: null })
    expect(await db.recurringInvoice.findUniqueOrThrow({ where: { id: fixture.recurring.id } })).toMatchObject({ isActive: false })
    expect(await db.recurringInvoice.findFirstOrThrow({ where: { maintenanceContractId: result.id } })).toMatchObject({ isActive: true })
    expect(await db.auditLog.count({ where: { userId: session.userId, action: "RENEW_MAINTENANCE_CONTRACT" } })).toBe(1)
  })
  it("rolls back the term, both billing states and equipment links when SQL refuses the audit", async () => {
    const source = await displayed(); await refuseAudit(); const before = await snapshot()
    const result = await renewMaintenanceContract(source.id, source.revision).then(() => null, error => error)
    expect(await snapshot()).toEqual(before); expect(result).toBeInstanceOf(Error)
  })
  it("refuses a displayed price or decision that became stale before the click", async () => {
    const source = await displayed()
    await db.maintenanceContract.update({ where: { id: source.id }, data: { priceCents: 30000 } })
    const before = await snapshot()
    await expect(renewMaintenanceContract(source.id, source.revision)).rejects.toThrow("Le contrat a changé")
    expect(await snapshot()).toEqual(before)
  })
  it("rechecks an accepted decision after number preparation", async () => {
    const source = await displayed()
    duringPreparation(() => db.maintenanceContract.update({ where: { id: source.id }, data: { renewalStatus: "DECLINED" } }))
    await expect(renewMaintenanceContract(source.id, source.revision)).rejects.toThrow("Le contrat a changé")
    expect(await current()).toMatchObject({ renewalStatus: "DECLINED", status: "ACTIVE" })
    expect(await db.maintenanceContract.count({ where: { renewedFromId: source.id } })).toBe(0)
    expect(await db.auditLog.count({ where: { userId: session.userId } })).toBe(0)
  })
  it("rechecks the company tax policy after number preparation", async () => {
    const source = await displayed()
    duringPreparation(() => db.company.update({ where: { id: fixture.companyId }, data: { isTvaApplicable: false } }))
    await expect(renewMaintenanceContract(source.id, source.revision)).rejects.toThrow("Le contrat a changé")
    expect((await db.company.findUniqueOrThrow({ where: { id: fixture.companyId } })).isTvaApplicable).toBe(false)
    expect(await db.maintenanceContract.count({ where: { renewedFromId: source.id } })).toBe(0)
    expect((await db.recurringInvoice.findUniqueOrThrow({ where: { id: fixture.recurring.id } })).isActive).toBe(true)
  })
  it("refuses an equipment list changed independently of the contract row", async () => {
    const source = await displayed()
    await db.maintenanceContractEquipment.create({ data: { contractId: source.id, equipmentId: fixture.optionalEquipment.id } })
    const before = await snapshot()
    await expect(renewMaintenanceContract(source.id, source.revision)).rejects.toThrow("Le contrat a changé")
    expect(await snapshot()).toEqual(before)
  })
  it("refuses a billing state changed independently of the contract row", async () => {
    const source = await displayed()
    await db.recurringInvoice.update({ where: { id: fixture.recurring.id }, data: { isActive: false } })
    const before = await snapshot()
    await expect(renewMaintenanceContract(source.id, source.revision)).rejects.toThrow("Le contrat a changé")
    expect(await snapshot()).toEqual(before)
  })
  it("refuses a foreign recurring invoice without changing either company", async () => {
    const source = await displayed()
    await db.recurringInvoice.update({ where: { id: fixture.recurring.id }, data: { companyId: fixture.foreignCompanyId, clientId: fixture.foreignClient.id } })
    const before = await snapshot()
    await expect(renewMaintenanceContract(source.id, source.revision)).rejects.toThrow("Contrat d’entretien introuvable")
    expect(await snapshot()).toEqual(before)
  })
  it("stops the old recurrence when the indexed new term is free", async () => {
    await db.maintenanceContract.update({ where: { id: fixture.positive.contracts }, data: { indexationRate: -100 } })
    const source = await displayed(), result = await renewMaintenanceContract(source.id, source.revision)
    expect((await db.maintenanceContract.findUniqueOrThrow({ where: { id: result.id } })).priceCents).toBe(0)
    expect((await db.recurringInvoice.findUniqueOrThrow({ where: { id: fixture.recurring.id } })).isActive).toBe(false)
    expect(await db.recurringInvoice.count({ where: { maintenanceContractId: result.id } })).toBe(0)
  })
  it("preserves an already renewed term", async () => {
    await db.maintenanceContract.update({ where: { id: fixture.positive.contracts }, data: { renewalStatus: "RENEWED" } })
    const source = await displayed(), before = await snapshot()
    await expect(renewMaintenanceContract(source.id, source.revision)).rejects.toThrow()
    expect(await snapshot()).toEqual(before)
  })
  it.each([undefined, "invalid", "a".repeat(64)])("refuses a missing or forged source revision (%#)", async revision => {
    const before = await snapshot()
    await expect(renewMaintenanceContract(fixture.positive.contracts, revision as string)).rejects.toThrow("Le contrat a changé")
    expect(await snapshot()).toEqual(before)
  })
  it.each(["absent", "inactive"])("does not create automatic billing from an %s recurrence", async mode => {
    if (mode === "absent") await db.recurringInvoice.delete({ where: { id: fixture.recurring.id } })
    else await db.recurringInvoice.update({ where: { id: fixture.recurring.id }, data: { isActive: false } })
    const source = await displayed(), result = await renewMaintenanceContract(source.id, source.revision)
    expect(await db.recurringInvoice.count({ where: { maintenanceContractId: result.id } })).toBe(0)
    expect(await db.maintenanceContractEquipment.findMany({ where: { contractId: result.id } })).toMatchObject([{ equipmentId: fixture.positive.equipments }])
  })
  it("uses a verified non-taxable policy in both the term and billing template", async () => {
    await db.company.update({ where: { id: fixture.companyId }, data: { isTvaApplicable: false } })
    const source = await displayed(), result = await renewMaintenanceContract(source.id, source.revision)
    expect((await db.maintenanceContract.findUniqueOrThrow({ where: { id: result.id } })).tvaRate).toBe(0)
    const recurrence = await db.recurringInvoice.findFirstOrThrow({ where: { maintenanceContractId: result.id } })
    expect(recurrence.template).toMatchObject({ lines: [{ quantity: 1, unitPriceCents: 10200, tvaRate: 0 }] })
  })
  it("keeps the revision stable when JSON keys have the same values in another order", async () => {
    await db.recurringInvoice.update({ where: { id: fixture.recurring.id }, data: { template: { object: "Fictional original", details: { b: 2, a: 1 } } } })
    const source = await displayed()
    await db.recurringInvoice.update({ where: { id: fixture.recurring.id }, data: { template: { details: { a: 1, b: 2 }, object: "Fictional original" } } })
    expect((await displayed()).revision).toBe(source.revision)
    await expect(renewMaintenanceContract(source.id, source.revision)).resolves.toMatchObject({ success: true })
  })
  it("refuses a changed billing template without a parent timestamp change", async () => {
    const source = await displayed(), timestamp = (await current()).updatedAt
    await db.recurringInvoice.update({ where: { id: fixture.recurring.id }, data: { template: { object: "Fictional newer billing agreement" } } })
    const before = await snapshot()
    await expect(renewMaintenanceContract(source.id, source.revision)).rejects.toThrow("Le contrat a changé")
    expect((await current()).updatedAt).toEqual(timestamp)
    expect(await snapshot()).toEqual(before)
  })
  it("rechecks recurrence generation progress after number preparation", async () => {
    const source = await displayed()
    duringPreparation(() => db.recurringInvoice.update({ where: { id: fixture.recurring.id }, data: { lastGenDate: new Date("2030-06-01"), nextGenDate: new Date("2030-07-01") } }))
    await expect(renewMaintenanceContract(source.id, source.revision)).rejects.toThrow("Le contrat a changé")
    expect((await current()).status).toBe("ACTIVE")
    expect(await db.maintenanceContract.count({ where: { renewedFromId: source.id } })).toBe(0)
    expect(await db.auditLog.count({ where: { userId: session.userId } })).toBe(0)
  })
  it("creates only one successor and audit under two simultaneous renewals", async () => {
    const source = await displayed()
    const results = await Promise.allSettled([renewMaintenanceContract(source.id, source.revision), renewMaintenanceContract(source.id, source.revision)])
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1)
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1)
    const successor = await db.maintenanceContract.findMany({ where: { renewedFromId: source.id } })
    expect(successor).toHaveLength(1)
    expect(await db.recurringInvoice.count({ where: { maintenanceContractId: successor[0].id, isActive: true } })).toBe(1)
    const audits = await db.auditLog.findMany({ where: { userId: session.userId } })
    expect(audits).toHaveLength(1)
    expect(audits[0].payload).toMatchObject({ previousContractId: source.id, sourceRevision: source.revision, previousRecurringInvoiceId: fixture.recurring.id })
  })
  it("allows a technician's manual renewal without a Finance right", async () => {
    await db.recurringInvoice.update({ where: { id: fixture.recurring.id }, data: { isActive: false } })
    await db.membership.update({ where: { id: fixture.member.id }, data: { role: "TECHNICIAN" } })
    const source = await displayed()
    await expect(renewMaintenanceContract(source.id, source.revision)).resolves.toMatchObject({ success: true })
  })
  it("preserves the administrator's coherent renewal", async () => {
    await db.membership.update({ where: { id: fixture.member.id }, data: { role: "ADMIN" } })
    const source = await displayed()
    await expect(renewMaintenanceContract(source.id, source.revision)).resolves.toMatchObject({ success: true })
  })
  it("uses fresh agency access instead of the displayed access", async () => {
    const source = await displayed()
    await db.membership.update({ where: { id: fixture.member.id }, data: { role: "TECHNICIAN" } })
    await db.agencyMembership.deleteMany({ where: { membershipId: fixture.member.id } })
    const before = await snapshot()
    await expect(renewMaintenanceContract(source.id, source.revision)).rejects.toThrow("Contrat d’entretien introuvable")
    expect(await snapshot()).toEqual(before)
  })
  it("refuses renewal in the public read-only demo", async () => {
    const source = await displayed(), before = await snapshot(); vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    await expect(renewMaintenanceContract(source.id, source.revision)).rejects.toThrow("lecture seule")
    expect(await snapshot()).toEqual(before)
  })
  it("requires authentication before any renewal", async () => {
    const source = await displayed(), before = await snapshot(); session.userId = ""
    await expect(renewMaintenanceContract(source.id, source.revision)).rejects.toThrow("Authentification requise")
    expect(await snapshot()).toEqual(before)
  })
  it("refuses a suspended membership", async () => {
    const source = await displayed()
    await db.membership.update({ where: { id: fixture.member.id }, data: { status: "SUSPENDED" } })
    const before = await snapshot()
    await expect(renewMaintenanceContract(source.id, source.revision)).rejects.toThrow("plus accès")
    expect(await snapshot()).toEqual(before)
  })
  it("refuses a foreign client without moving billing", async () => {
    const source = await displayed()
    await db.maintenanceContract.update({ where: { id: source.id }, data: { clientId: fixture.foreignClient.id } })
    const before = await snapshot()
    await expect(renewMaintenanceContract(source.id, source.revision)).rejects.toThrow("Contrat d’entretien introuvable")
    expect(await snapshot()).toEqual(before)
  })
  it("refuses an old recurrence linked to another local client", async () => {
    const client = await db.client.create({ data: { companyId: fixture.companyId, name: "Fictional unrelated local client" } })
    await db.recurringInvoice.update({ where: { id: fixture.recurring.id }, data: { clientId: client.id } })
    const source = await displayed(), before = await snapshot()
    await expect(renewMaintenanceContract(source.id, source.revision)).rejects.toThrow("Contrat d’entretien introuvable")
    expect(await snapshot()).toEqual(before)
  })
  it("refuses a foreign equipment link without silently dropping it", async () => {
    await db.maintenanceContractEquipment.create({ data: { contractId: fixture.positive.contracts, equipmentId: fixture.foreignEquipment.id } })
    const source = await displayed(), before = await snapshot()
    await expect(renewMaintenanceContract(source.id, source.revision)).rejects.toThrow("Équipement introuvable")
    expect(await snapshot()).toEqual(before)
  })
  it("preserves an existing successor despite an inconsistent parent decision", async () => {
    await db.maintenanceContract.create({ data: { companyId: fixture.companyId, clientId: fixture.site.clientId, siteId: fixture.site.id,
      number: "FICTIONAL-SUCCESSOR", label: "Fictional existing successor", startDate: new Date("2031-01-01"), renewedFromId: fixture.positive.contracts } })
    const source = await displayed(), before = await snapshot()
    await expect(renewMaintenanceContract(source.id, source.revision)).rejects.toThrow("Ce terme a déjà été renouvelé")
    expect(await snapshot()).toEqual(before)
  })
  it("refuses an unrepresentable indexed price without any partial transition", async () => {
    await db.maintenanceContract.update({ where: { id: fixture.positive.contracts }, data: { priceCents: 2147483647, indexationRate: 100 } })
    const source = await displayed(), before = await snapshot()
    await expect(renewMaintenanceContract(source.id, source.revision)).rejects.toThrow("dépasse la capacité de calcul")
    expect(await snapshot()).toEqual(before)
  })
})
