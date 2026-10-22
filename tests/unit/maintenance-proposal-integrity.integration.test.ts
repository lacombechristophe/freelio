import { PrismaClient } from "@prisma/client"
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createOperationsDashboardFixture } from "../helpers/operations-dashboard-fixture"

const session = vi.hoisted(() => ({ userId: "", companyId: "", authenticated: true }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => session.authenticated ? { user: { id: session.userId }, companyId: session.companyId } : null }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import { createMaintenanceRenewalProposal } from "@/actions/contrats"
import { getOperationsMaintenanceDirectory } from "@/actions/operations"
import * as numbering from "@/lib/document-numbering"

const db = new PrismaClient()
const propose = createMaintenanceRenewalProposal

describe.sequential("Maintenance proposals retain their displayed source and mandatory audit", () => {
  let fixture: Awaited<ReturnType<typeof createOperationsDashboardFixture>>
  const current = () => db.maintenanceContract.findUniqueOrThrow({ where: { id: fixture.positive.contracts } })
  async function displayed() {
    const item = (await getOperationsMaintenanceDirectory()).items.find(row => row.id === fixture.positive.contracts)!
    return { id: item.id, revision: item.renewalRevision }
  }
  const snapshot = () => Promise.all([fixture.snapshot(), db.contract.findMany({ where: { companyId: { in: [fixture.companyId, fixture.foreignCompanyId] } }, orderBy: { id: "asc" } })])
  beforeEach(async () => {
    fixture = await createOperationsDashboardFixture(db); session.userId = fixture.user.id; session.companyId = fixture.companyId; session.authenticated = true
    await db.contract.deleteMany({ where: { maintenanceContractId: fixture.positive.contracts } })
    await db.maintenanceContract.deleteMany({ where: { renewedFromId: fixture.positive.contracts } })
    await db.maintenanceContractEquipment.deleteMany({ where: { contractId: fixture.positive.contracts } })
    await db.maintenanceContractEquipment.create({ data: { contractId: fixture.positive.contracts, equipmentId: fixture.positive.equipments } })
    await db.maintenanceContract.update({ where: { id: fixture.positive.contracts }, data: { startDate: new Date("2030-01-01"), endDate: new Date("2030-12-31"), renewalStatus: "ACCEPTED", priceCents: 10000, indexationRate: 2 } })
  })
  async function dropTrigger() {
    if (process.env.DATABASE_URL?.startsWith("file:")) await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS "fictional_maintenance_proposal_audit_failure"')
    else { await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS "fictional_maintenance_proposal_audit_failure" ON "AuditLog"'); await db.$executeRawUnsafe('DROP FUNCTION IF EXISTS fictional_maintenance_proposal_audit_failure()') }
  }
  async function refuseAudit() {
    expect(session.userId).toMatch(/^[a-z0-9]+$/)
    if (process.env.DATABASE_URL?.startsWith("file:")) await db.$executeRawUnsafe(`CREATE TRIGGER "fictional_maintenance_proposal_audit_failure" BEFORE INSERT ON "AuditLog" WHEN NEW."userId" = '${session.userId}' BEGIN SELECT RAISE(ABORT, 'Fictional maintenance proposal audit failure'); END`)
    else {
      await db.$executeRawUnsafe(`CREATE FUNCTION fictional_maintenance_proposal_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."userId" = '${session.userId}' THEN RAISE EXCEPTION 'Fictional maintenance proposal audit failure'; END IF; RETURN NEW; END; $$`)
      await db.$executeRawUnsafe('CREATE TRIGGER "fictional_maintenance_proposal_audit_failure" BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION fictional_maintenance_proposal_audit_failure()')
    }
  }
  afterEach(async () => {
    vi.restoreAllMocks(); vi.unstubAllEnvs(); await dropTrigger()
    if (fixture) { await db.auditLog.deleteMany({ where: { userId: fixture.user.id } }); await fixture.cleanup() }
  })
  afterAll(async () => { await db.$disconnect() })
  it("creates an own draft and one audit from a coherent displayed source", async () => {
    const source = await displayed(), result = await propose(source.id, source.revision)
    expect(await db.contract.findUniqueOrThrow({ where: { id: result.id } })).toMatchObject({ companyId: fixture.companyId, clientId: (await current()).clientId, maintenanceContractId: source.id, status: "DRAFT", kind: "MAINTENANCE_RENEWAL" })
    expect(await db.auditLog.count({ where: { userId: session.userId, action: "CREATE_MAINTENANCE_RENEWAL_PROPOSAL" } })).toBe(1)
  })
  it("reuses an existing coherent active proposal without another write", async () => {
    const source = await displayed(), first = await propose(source.id, source.revision), before = await snapshot()
    expect((await propose(source.id, source.revision)).id).toBe(first.id)
    expect(await snapshot()).toEqual(before)
  })
  it("rolls back the draft and source metadata when SQL refuses the audit", async () => {
    const source = await displayed(); await refuseAudit(); const before = await snapshot()
    const result = await propose(source.id, source.revision).then(() => null, error => error)
    expect(await snapshot()).toEqual(before); expect(result).toBeInstanceOf(Error)
  })
  it("refuses a price changed after the displayed proposal source", async () => {
    const source = await displayed(); await db.maintenanceContract.update({ where: { id: source.id }, data: { priceCents: 30000 } }); const before = await snapshot()
    await expect(propose(source.id, source.revision)).rejects.toThrow(); expect(await snapshot()).toEqual(before)
  })
  it("refuses a site label changed independently of the maintenance revision", async () => {
    const source = await displayed(); await db.customerSite.update({ where: { id: fixture.site.id }, data: { label: "Fictional renamed site" } }); const before = await snapshot()
    await expect(propose(source.id, source.revision)).rejects.toThrow(); expect(await snapshot()).toEqual(before)
  })
  it("does not create a proposal linked to a foreign client", async () => {
    const source = await displayed(); const foreign = await db.client.findFirstOrThrow({ where: { companyId: fixture.foreignCompanyId } })
    await db.maintenanceContract.update({ where: { id: source.id }, data: { clientId: foreign.id } }); const before = await snapshot()
    await expect(propose(source.id, source.revision)).rejects.toThrow(); expect(await snapshot()).toEqual(before)
  })
  it("allows Commercial to prepare the proposal without general operational writes", async () => {
    await db.membership.update({ where: { id: fixture.member.id }, data: { role: "SALES" } })
    const source = await displayed(), before = await current(), result = await propose(source.id, source.revision)
    expect(await db.contract.findUniqueOrThrow({ where: { id: result.id } })).toMatchObject({ status: "DRAFT", maintenanceContractId: source.id })
    const saved = await current()
    expect(saved).toEqual({ ...before, currentRenewalProposalId: result.id, updatedAt: saved.updatedAt })
    expect(saved.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime())
  })
  it("identifies the indexed price as HT rather than promising that price TTC", async () => {
    const source = await displayed(), result = await propose(source.id, source.revision)
    const document = await db.contract.findUniqueOrThrow({ where: { id: result.id } })
    expect(document.content).toMatch(/100[^0-9]*00[^<]*HT/); expect(document.content).toMatch(/102[^0-9]*00[^<]*HT/); expect(document.content).not.toContain("TTC")
  })
  it("retains a declined decision and all data when refusing a new proposal", async () => {
    await db.maintenanceContract.update({ where: { id: fixture.positive.contracts }, data: { renewalStatus: "DECLINED" } })
    const source = await displayed(), before = await snapshot()
    await expect(propose(source.id, source.revision)).rejects.toThrow(); expect(await snapshot()).toEqual(before)
  })
  it("refuses a proposal whose indexed amount exceeds the stored-price capacity", async () => {
    await db.maintenanceContract.update({ where: { id: fixture.positive.contracts }, data: { priceCents: 2147483647, indexationRate: 100 } })
    const source = await displayed(), before = await snapshot()
    await expect(propose(source.id, source.revision)).rejects.toThrow(); expect(await snapshot()).toEqual(before)
  })
  it.each([undefined, "invalid", "0".repeat(64)])("refuses missing, malformed or forged displayed revisions: %s", async revision => {
    const source = await displayed(), before = await snapshot()
    await expect(propose(source.id, revision as string)).rejects.toThrow("Le contrat a changé")
    expect(await snapshot()).toEqual(before)
  })
  it.each(["OPERATIONS", "TECHNICIAN", "SERVICE", "ACCOUNTING", "VIEWER"])("refuses %s before reading business numbering", async role => {
    const source = await displayed(); await db.membership.update({ where: { id: fixture.member.id }, data: { role } })
    const before = await snapshot(), read = vi.spyOn(numbering, "readCompanyDocumentNumbers")
    await expect(propose(source.id, source.revision)).rejects.toThrow("droits nécessaires")
    expect(read).not.toHaveBeenCalled(); expect(await snapshot()).toEqual(before)
  })
  it("requires authentication before business reads", async () => {
    const source = await displayed(), before = await snapshot(); session.authenticated = false
    const read = vi.spyOn(numbering, "readCompanyDocumentNumbers")
    await expect(propose(source.id, source.revision)).rejects.toThrow("Authentification requise")
    expect(read).not.toHaveBeenCalled(); expect(await snapshot()).toEqual(before)
  })
  it("rechecks a suspended membership before business reads", async () => {
    const source = await displayed(); await db.membership.update({ where: { id: fixture.member.id }, data: { status: "SUSPENDED" } })
    const before = await snapshot(), read = vi.spyOn(numbering, "readCompanyDocumentNumbers")
    await expect(propose(source.id, source.revision)).rejects.toThrow("plus accès")
    expect(read).not.toHaveBeenCalled(); expect(await snapshot()).toEqual(before)
  })
  it("refuses the public demo before numbering and leaves all data unchanged", async () => {
    const source = await displayed(), before = await snapshot(), read = vi.spyOn(numbering, "readCompanyDocumentNumbers")
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    await expect(propose(source.id, source.revision)).rejects.toThrow("lecture seule")
    expect(read).not.toHaveBeenCalled(); expect(await snapshot()).toEqual(before)
  })
  it.each(["price", "decision"])("rechecks a changed %s after number preparation", async kind => {
    const source = await displayed(), original = numbering.readCompanyDocumentNumbers
    vi.spyOn(numbering, "readCompanyDocumentNumbers").mockImplementationOnce(async read => {
      const result = await original(read)
      await db.maintenanceContract.update({ where: { id: source.id }, data: kind === "price" ? { priceCents: 30000 } : { renewalStatus: "DECLINED" } })
      return result
    })
    await expect(propose(source.id, source.revision)).rejects.toThrow()
    expect(await db.contract.count({ where: { maintenanceContractId: source.id } })).toBe(0)
    expect(await db.auditLog.count({ where: { userId: session.userId } })).toBe(0)
    expect(await current()).toMatchObject(kind === "price" ? { priceCents: 30000 } : { renewalStatus: "DECLINED" })
  })
  it("rechecks an agency assignment revoked after display", async () => {
    await db.membership.update({ where: { id: fixture.member.id }, data: { role: "SALES" } })
    const source = await displayed(); await db.agencyMembership.deleteMany({ where: { membershipId: fixture.member.id } }); const before = await snapshot()
    await expect(propose(source.id, source.revision)).rejects.toThrow("introuvable"); expect(await snapshot()).toEqual(before)
  })
  it("refuses an archived site without creating a draft or audit", async () => {
    await db.customerSite.update({ where: { id: fixture.site.id }, data: { archivedAt: new Date() } })
    const source = await displayed(), before = await snapshot()
    await expect(propose(source.id, source.revision)).rejects.toThrow("désactivé"); expect(await snapshot()).toEqual(before)
  })
  it("refuses a site belonging to a different local client", async () => {
    const client = await db.client.create({ data: { companyId: fixture.companyId, name: "Fictional other local client" } })
    await db.customerSite.update({ where: { id: fixture.site.id }, data: { clientId: client.id } })
    const source = await displayed(), before = await snapshot()
    await expect(propose(source.id, source.revision)).rejects.toThrow("introuvable"); expect(await snapshot()).toEqual(before)
  })
  it("refuses a foreign site without returning its identity", async () => {
    const source = await displayed(), client = await db.client.findFirstOrThrow({ where: { companyId: fixture.foreignCompanyId } })
    const foreign = await db.customerSite.create({ data: { companyId: fixture.foreignCompanyId, clientId: client.id, agencyId: fixture.foreignAgency.id, label: "FOREIGN-PROPOSAL-SITE", address1: "Fictional foreign address" } })
    await db.maintenanceContract.update({ where: { id: source.id }, data: { siteId: foreign.id } }); const before = await snapshot()
    await expect(propose(source.id, source.revision)).rejects.toThrow("Contrat d’entretien introuvable"); expect(await snapshot()).toEqual(before)
  })
  it("does not reuse a proposal related to a foreign client", async () => {
    const source = await displayed(), foreign = await db.client.findFirstOrThrow({ where: { companyId: fixture.foreignCompanyId } })
    const invalid = await db.contract.create({ data: { companyId: fixture.companyId, clientId: foreign.id, maintenanceContractId: source.id, number: "FOREIGN-PROPOSAL", title: "FOREIGN-PROPOSAL", content: "FOREIGN-PROPOSAL" } })
    const result = await propose(source.id, source.revision)
    expect(result.id).not.toBe(invalid.id); expect(JSON.stringify(result)).not.toContain("FOREIGN-PROPOSAL")
    expect(await db.contract.findUniqueOrThrow({ where: { id: invalid.id } })).toEqual(invalid)
  })
  it("serializes two preparations into one draft and one audit", async () => {
    const source = await displayed(), before = await current()
    const results = await Promise.all([propose(source.id, source.revision), propose(source.id, source.revision)])
    expect(results[0].id).toBe(results[1].id)
    expect(await db.contract.count({ where: { maintenanceContractId: source.id } })).toBe(1)
    expect(await db.auditLog.count({ where: { userId: session.userId, action: "CREATE_MAINTENANCE_RENEWAL_PROPOSAL" } })).toBe(1)
    const saved = await current()
    expect(saved).toEqual({ ...before, currentRenewalProposalId: results[0].id, updatedAt: saved.updatedAt })
    expect(saved.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime())
  })
  it("requires an end date and preserves the source on refusal", async () => {
    await db.maintenanceContract.update({ where: { id: fixture.positive.contracts }, data: { endDate: null } })
    const source = await displayed(), before = await snapshot()
    await expect(propose(source.id, source.revision)).rejects.toThrow("date de fin"); expect(await snapshot()).toEqual(before)
  })
})
