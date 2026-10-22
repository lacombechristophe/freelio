import { PrismaClient } from "@prisma/client"
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createOperationsDashboardFixture } from "../helpers/operations-dashboard-fixture"

const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import { updateMaintenanceRenewalSettings } from "@/actions/operations"
import prisma from "@/lib/prisma"
import { requestContext } from "@/lib/context"

const db = new PrismaClient()
describe.sequential("Maintenance settings preserve the displayed revision and mandatory audit", () => {
  let fixture: Awaited<ReturnType<typeof createOperationsDashboardFixture>>, revision: string
  const input = () => ({ contractId: fixture.positive.contracts, expectedUpdatedAt: revision, noticeDays: 45, indexationRate: 2.5,
    autoRenew: true, renewalStatus: "ACCEPTED", renewalNotes: "Fictional negotiated renewal" })
  const stored = () => db.maintenanceContract.findUniqueOrThrow({ where: { id: fixture.positive.contracts } })
  beforeEach(async () => {
    fixture = await createOperationsDashboardFixture(db)
    session.userId = fixture.user.id; session.companyId = fixture.companyId
    await db.maintenanceContract.deleteMany({ where: { renewedFromId: fixture.positive.contracts } })
    revision = (await db.maintenanceContract.update({ where: { id: fixture.positive.contracts }, data: { updatedAt: new Date("2030-01-01T12:00:00Z") } })).updatedAt.toISOString()
  })
  async function dropTrigger() {
    if (process.env.DATABASE_URL?.startsWith("file:")) await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS "fictional_maintenance_settings_audit_failure"')
    else {
      await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS "fictional_maintenance_settings_audit_failure" ON "AuditLog"')
      await db.$executeRawUnsafe('DROP FUNCTION IF EXISTS fictional_maintenance_settings_audit_failure()')
    }
  }
  async function refuseAudit() {
    expect(session.userId).toMatch(/^[a-z0-9]+$/)
    if (process.env.DATABASE_URL?.startsWith("file:")) await db.$executeRawUnsafe(`CREATE TRIGGER "fictional_maintenance_settings_audit_failure" BEFORE INSERT ON "AuditLog" WHEN NEW."userId" = '${session.userId}' BEGIN SELECT RAISE(ABORT, 'Fictional maintenance audit failure'); END`)
    else {
      await db.$executeRawUnsafe(`CREATE FUNCTION fictional_maintenance_settings_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."userId" = '${session.userId}' THEN RAISE EXCEPTION 'Fictional maintenance audit failure'; END IF; RETURN NEW; END; $$`)
      await db.$executeRawUnsafe('CREATE TRIGGER "fictional_maintenance_settings_audit_failure" BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION fictional_maintenance_settings_audit_failure()')
    }
  }
  afterEach(async () => {
    vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); await dropTrigger()
    if (fixture) { await db.auditLog.deleteMany({ where: { userId: fixture.user.id } }); await fixture.cleanup() }
  })
  afterAll(async () => { await db.$disconnect() })

  it("saves coherent settings with their audit", async () => {
    await expect(updateMaintenanceRenewalSettings(input())).resolves.toMatchObject({ success: true })
    expect(await stored()).toMatchObject({ noticeDays: 45, indexationRate: 2.5, autoRenew: true, renewalStatus: "ACCEPTED", renewalNotes: input().renewalNotes })
    expect(await db.auditLog.findMany({ where: { userId: session.userId } })).toMatchObject([{ action: "UPDATE_MAINTENANCE_RENEWAL", resourceId: input().contractId }])
    const updated = await stored()
    expect(updated.updatedAt.getTime()).toBeGreaterThan(Date.parse(revision))
    expect((await db.auditLog.findFirstOrThrow({ where: { userId: session.userId } })).payload).toMatchObject({ previousUpdatedAt: revision, updatedAt: updated.updatedAt.toISOString() })
  })
  it("lets Service save only its renewal settings in an accessible agency", async () => {
    await db.membership.update({ where: { id: fixture.member.id }, data: { role: "SERVICE" } })
    await expect(updateMaintenanceRenewalSettings(input())).resolves.toMatchObject({ success: true })
    expect(await stored()).toMatchObject({ noticeDays: 45, renewalStatus: "ACCEPTED" })
    expect(await db.auditLog.count({ where: { userId: session.userId } })).toBe(1)
  })
  it("rolls back settings and revision when SQL refuses the audit", async () => {
    await refuseAudit()
    const before = await fixture.snapshot()
    const result = await updateMaintenanceRenewalSettings(input()).then(() => null, error => error)
    expect(await fixture.snapshot()).toEqual(before)
    expect(result).toBeInstanceOf(Error)
  })
  it("refuses an old displayed revision without overwriting the newer settings", async () => {
    await db.maintenanceContract.update({ where: { id: input().contractId }, data: { noticeDays: 90, renewalNotes: "Fictional newer agreement", updatedAt: new Date("2030-01-02T12:00:00Z") } })
    const before = await fixture.snapshot()
    await expect(updateMaintenanceRenewalSettings(input())).rejects.toThrow("Ce contrat a changé")
    expect(await fixture.snapshot()).toEqual(before)
  })
  it.each(["foreign client", "foreign site", "different site client"])("refuses settings through a %s", async kind => {
    if (kind === "foreign client") await db.maintenanceContract.update({ where: { id: input().contractId }, data: { clientId: fixture.foreignClient.id } })
    if (kind === "foreign site") await db.maintenanceContract.update({ where: { id: input().contractId }, data: { siteId: fixture.negative.sites } })
    if (kind === "different site client") {
      const client = await db.client.create({ data: { companyId: fixture.companyId, name: "Fictional other local client" } })
      await db.customerSite.update({ where: { id: fixture.site.id }, data: { clientId: client.id } })
    }
    revision = (await stored()).updatedAt.toISOString()
    const before = await fixture.snapshot()
    await expect(updateMaintenanceRenewalSettings(input())).rejects.toThrow("Contrat d’entretien introuvable")
    expect(await fixture.snapshot()).toEqual(before)
  })
  it("preserves a term with an existing successor even if its status is inconsistent", async () => {
    await db.maintenanceContract.create({ data: { companyId: fixture.companyId, clientId: fixture.site.clientId, siteId: fixture.site.id,
      number: "FICTIONAL-SUCCESSOR", label: "Fictional existing successor", startDate: new Date("2031-01-01"), renewedFromId: input().contractId } })
    const before = await fixture.snapshot()
    await expect(updateMaintenanceRenewalSettings(input())).rejects.toThrow("Ce terme a déjà été renouvelé")
    expect(await fixture.snapshot()).toEqual(before)
  })
  it("preserves an already renewed term", async () => {
    revision = (await db.maintenanceContract.update({ where: { id: input().contractId }, data: { renewalStatus: "RENEWED" } })).updatedAt.toISOString()
    const before = await fixture.snapshot()
    await expect(updateMaintenanceRenewalSettings(input())).rejects.toThrow("Ce terme a déjà été renouvelé")
    expect(await fixture.snapshot()).toEqual(before)
  })
  it.each(["ADMIN", "TECHNICIAN"])("keeps legitimate settings available to %s", async role => {
    await db.membership.update({ where: { id: fixture.member.id }, data: { role } })
    await expect(updateMaintenanceRenewalSettings(input())).resolves.toMatchObject({ success: true })
  })
  it.each(["OPERATIONS", "SALES", "ACCOUNTING", "VIEWER"])("requires Service write before business execution for %s", async role => {
    await db.membership.update({ where: { id: fixture.member.id }, data: { role } })
    const before = await fixture.snapshot(), run = vi.spyOn(requestContext, "run")
    await expect(updateMaintenanceRenewalSettings(input())).rejects.toThrow("pas les droits")
    expect(run).not.toHaveBeenCalled()
    expect(await fixture.snapshot()).toEqual(before)
  })
  it("requires authentication before execution", async () => {
    const before = await fixture.snapshot(); session.userId = ""
    await expect(updateMaintenanceRenewalSettings(input())).rejects.toThrow("Authentification requise")
    expect(await fixture.snapshot()).toEqual(before)
  })
  it("rechecks the active membership and its agency assignments", async () => {
    await db.membership.update({ where: { id: fixture.member.id }, data: { role: "SERVICE" } })
    await db.agencyMembership.deleteMany({ where: { membershipId: fixture.member.id } })
    const before = await fixture.snapshot()
    await expect(updateMaintenanceRenewalSettings(input())).rejects.toThrow("Contrat d’entretien introuvable")
    expect(await fixture.snapshot()).toEqual(before)
    await db.membership.update({ where: { id: fixture.member.id }, data: { status: "SUSPENDED" } })
    await expect(updateMaintenanceRenewalSettings(input())).rejects.toThrow("plus accès")
    expect(await fixture.snapshot()).toEqual(before)
  })
  it("refuses every settings write in the public read-only demo", async () => {
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    const before = await fixture.snapshot(), run = vi.spyOn(requestContext, "run")
    await expect(updateMaintenanceRenewalSettings(input())).rejects.toThrow("lecture seule")
    expect(run).not.toHaveBeenCalled()
    expect(await fixture.snapshot()).toEqual(before)
  })
  it.each([
    ["missing revision", { expectedUpdatedAt: undefined }], ["invalid revision", { expectedUpdatedAt: "invalid" }],
    ["negative notice", { noticeDays: -1 }], ["fractional notice", { noticeDays: 1.5 }], ["excess indexation", { indexationRate: 101 }],
    ["renewed decision", { renewalStatus: "RENEWED" }], ["string boolean", { autoRenew: "true" }], ["oversized notes", { renewalNotes: "x".repeat(5001) }],
  ] as const)("rejects malformed %s without writes", async (_label, invalid) => {
    const before = await fixture.snapshot()
    await expect(updateMaintenanceRenewalSettings({ ...input(), ...invalid })).rejects.toThrow()
    expect(await fixture.snapshot()).toEqual(before)
  })
  it("preserves a historical term whose primary status is already RENEWED", async () => {
    revision = (await db.maintenanceContract.update({ where: { id: input().contractId }, data: { status: "RENEWED" } })).updatedAt.toISOString()
    const before = await fixture.snapshot()
    await expect(updateMaintenanceRenewalSettings(input())).rejects.toThrow("Ce terme a déjà été renouvelé")
    expect(await fixture.snapshot()).toEqual(before)
  })
  it("does not disclose or change a different company's contract", async () => {
    const foreign = await db.maintenanceContract.create({ data: { companyId: fixture.foreignCompanyId, clientId: fixture.foreignClient.id,
      siteId: fixture.foreignEquipment.siteId, number: "FICTIONAL-PRIVATE", label: "Fictional other company term", startDate: new Date("2030-01-01") } })
    const before = await fixture.snapshot()
    await expect(updateMaintenanceRenewalSettings({ ...input(), contractId: foreign.id, expectedUpdatedAt: foreign.updatedAt.toISOString() })).rejects.toThrow("Contrat d’entretien introuvable")
    expect(await fixture.snapshot()).toEqual(before)
  })
  it("does not update a term with a foreign recurring invoice", async () => {
    await db.recurringInvoice.update({ where: { id: fixture.recurring.id }, data: { companyId: fixture.foreignCompanyId, clientId: fixture.foreignClient.id } })
    const before = await fixture.snapshot()
    await expect(updateMaintenanceRenewalSettings(input())).rejects.toThrow("Contrat d’entretien introuvable")
    expect(await fixture.snapshot()).toEqual(before)
  })
  it("accepts exactly one of two saves of the same displayed revision", async () => {
    const results = await Promise.allSettled([
      updateMaintenanceRenewalSettings(input()), updateMaintenanceRenewalSettings({ ...input(), noticeDays: 60 }),
    ])
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1)
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1)
    expect(await db.auditLog.count({ where: { userId: session.userId } })).toBe(1)
    const saved = await stored(), audit = await db.auditLog.findFirstOrThrow({ where: { userId: session.userId } })
    expect(audit.payload).toMatchObject({ noticeDays: saved.noticeDays, updatedAt: saved.updatedAt.toISOString() })
  })
  it("does not grant general operational edits to Service", async () => {
    await db.membership.update({ where: { id: fixture.member.id }, data: { role: "SERVICE" } })
    const before = await fixture.snapshot()
    const context = { companyId: fixture.companyId, userId: session.userId, membershipId: fixture.member.id, agencyIds: [fixture.agency.id], role: "SERVICE" as const, actionPermission: "service.write" as const }
    await requestContext.run(context, async () => {
      await expect(prisma.maintenanceContract.update({ where: { id: input().contractId }, data: { priceCents: 500 } })).rejects.toThrow("FORBIDDEN:operations.write")
      await expect(prisma.maintenanceContract.updateMany({ where: { id: input().contractId }, data: { noticeDays: 10 } })).rejects.toThrow("FORBIDDEN:operations.write")
    })
    await requestContext.run({ ...context, maintenanceRenewalSettings: { contractId: input().contractId, expectedUpdatedAt: revision } }, async () => {
      const data = { noticeDays: 45, indexationRate: 2.5, autoRenew: true, renewalStatus: "ACCEPTED", renewalNotes: "Fictional settings", updatedAt: new Date() }
      await expect(prisma.maintenanceContract.updateMany({ where: { id: input().contractId, updatedAt: new Date(revision) }, data: { ...data, priceCents: 500 } })).rejects.toThrow("FORBIDDEN:operations.write")
      await expect(prisma.maintenanceContract.updateMany({ where: { id: fixture.negative.contracts, updatedAt: new Date(revision) }, data })).rejects.toThrow("FORBIDDEN:operations.write")
      await expect(prisma.maintenanceContract.delete({ where: { id: input().contractId } })).rejects.toThrow("FORBIDDEN:operations.write")
    })
    expect(await fixture.snapshot()).toEqual(before)
  })
})
