import { PrismaClient } from "@prisma/client"
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createOperationsDashboardFixture } from "../helpers/operations-dashboard-fixture"

const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import { importMigrationRun } from "@/actions/migrations"

const db = new PrismaClient()
const kinds = ["projects", "equipments", "tickets", "interventions", "maintenance_contracts"] as const
describe.sequential("asset imports retain raw data when a new reference is deactivated", () => {
  let fixture: Awaited<ReturnType<typeof createOperationsDashboardFixture>>
  let runId: string
  beforeEach(async () => {
    fixture = await createOperationsDashboardFixture(db)
    session.companyId = fixture.companyId; session.userId = fixture.user.id
    runId = (await db.migrationRun.create({ data: { companyId: fixture.companyId, provider: "EXTRABAT", kind: "MANUAL_ARCHIVE", status: "SIMULATED" } })).id
    const targets = [["Client", fixture.site.clientId], ["CustomerSite", fixture.site.id], ["Equipment", fixture.positive.equipments], ["Project", fixture.project.id], ["ServiceTicket", fixture.ticket.id]]
    await db.externalIdMap.createMany({ data: targets.map(([targetModel, targetRecordId]) => ({ companyId: fixture.companyId, provider: "EXTRABAT",
      sourceObjectType: targetModel, sourceRecordId: targetModel, targetModel, targetRecordId })) })
  })
  afterEach(async () => {
    if (fixture) {
      await db.externalIdMap.deleteMany({ where: { companyId: fixture.companyId } })
      await db.migrationRun.deleteMany({ where: { companyId: fixture.companyId } })
      await db.auditLog.deleteMany({ where: { userId: fixture.user.id } }); await fixture.cleanup()
    }
  })
  afterAll(async () => { await db.$disconnect() })
  async function stage(kind: string, extra: Record<string, string> = {}) {
    const payload = { name: "Fictional imported asset", title: "Fictional imported work", address: "Fictional imported address", serial_number: "IMPORTED-ONE",
      start_date: "2031-01-05T14:00:00.000Z", scheduled_start: "2031-01-05T14:00:00.000Z", status: "ACTIVE",
      association_company_id: "Client", association_site_id: "CustomerSite", association_equipment_id: "Equipment", association_project_id: "Project", association_ticket_id: "ServiceTicket", ...extra }
    const row = await db.sourceRecord.create({ data: { companyId: fixture.companyId, runId, provider: "EXTRABAT", objectType: kind, sourceId: "import-one", checksum: "fictional-source-checksum", payload } })
    await db.migrationMetric.create({ data: { runId, objectType: kind, sourceCount: 1, extracted: 1 } })
    return row
  }
  it.each(kinds)("imports and replays coherent %s with the same target", async kind => {
    const row = await stage(kind)
    await expect(importMigrationRun(runId)).resolves.toMatchObject({ imported: 1, rejected: 0 })
    const target = (await db.sourceRecord.findUniqueOrThrow({ where: { id: row.id } })).targetRecordId
    await expect(importMigrationRun(runId)).resolves.toMatchObject({ imported: 1, rejected: 0 })
    expect((await db.sourceRecord.findUniqueOrThrow({ where: { id: row.id } })).targetRecordId).toBe(target)
  })
  it.each(kinds)("refuses new %s on a deactivated site without touching its histories", async kind => {
    const row = await stage(kind)
    await db.customerSite.update({ where: { id: fixture.site.id }, data: { archivedAt: new Date() } })
    const before = await fixture.snapshot()
    await expect(importMigrationRun(runId)).rejects.toThrow("Site client introuvable ou désactivé")
    expect(await fixture.snapshot()).toEqual(before)
    expect(await db.sourceRecord.findUniqueOrThrow({ where: { id: row.id } })).toEqual(row)
    expect((await db.migrationRun.findUniqueOrThrow({ where: { id: runId } })).status).toBe("FAILED")
  })
  it("refuses an imported ticket's deactivated equipment while retaining its raw source", async () => {
    const row = await stage("tickets")
    await db.equipment.update({ where: { id: fixture.positive.equipments }, data: { archivedAt: new Date() } })
    const before = await fixture.snapshot()
    await expect(importMigrationRun(runId)).rejects.toThrow("Équipement introuvable, désactivé ou rattaché à un autre site")
    expect(await fixture.snapshot()).toEqual(before)
    expect(await db.sourceRecord.findUniqueOrThrow({ where: { id: row.id } })).toEqual(row)
  })
  it("refreshes an existing equipment's metadata without reactivating its site or technical status", async () => {
    const source = await stage("equipments", { status: "EN_REPARATION" })
    await importMigrationRun(runId)
    const row = await db.sourceRecord.findUniqueOrThrow({ where: { id: source.id } })
    const archivedAt = new Date("2030-01-01T12:00:00.000Z")
    await db.equipment.update({ where: { id: row.targetRecordId! }, data: { archivedAt } })
    await db.customerSite.update({ where: { id: fixture.site.id }, data: { archivedAt } })
    await expect(importMigrationRun(runId)).resolves.toMatchObject({ imported: 1 })
    expect(await db.equipment.findUniqueOrThrow({ where: { id: row.targetRecordId! } })).toMatchObject({ archivedAt, status: "EN_REPARATION", siteId: fixture.site.id })
    expect((await db.customerSite.findUniqueOrThrow({ where: { id: fixture.site.id } })).archivedAt).toEqual(archivedAt)
  })
  it("refuses a serial-number collision on another site without silently moving an existing equipment", async () => {
    await db.equipment.update({ where: { id: fixture.positive.equipments }, data: { serialNumber: "IMPORTED-ONE" } })
    await db.externalIdMap.updateMany({ where: { companyId: fixture.companyId, targetModel: "CustomerSite" }, data: { targetRecordId: fixture.otherSite.id } })
    const row = await stage("equipments")
    const before = await fixture.snapshot()
    await expect(importMigrationRun(runId)).rejects.toThrow("déjà rattaché à un autre site")
    expect(await fixture.snapshot()).toEqual(before)
    expect(await db.sourceRecord.findUniqueOrThrow({ where: { id: row.id } })).toEqual(row)
  })
  it("reconciles the same serial number on the same site without creating a second equipment", async () => {
    await db.equipment.update({ where: { id: fixture.positive.equipments }, data: { serialNumber: "IMPORTED-ONE" } })
    const row = await stage("equipments")
    const count = await db.equipment.count({ where: { companyId: fixture.companyId } })
    await expect(importMigrationRun(runId)).resolves.toMatchObject({ imported: 1 })
    expect((await db.sourceRecord.findUniqueOrThrow({ where: { id: row.id } })).targetRecordId).toBe(fixture.positive.equipments)
    expect(await db.equipment.count({ where: { companyId: fixture.companyId } })).toBe(count)
  })
  const work = [["projects", "COMPLETED", "ACTIVE"], ["tickets", "CLOSED", "OPEN"], ["interventions", "COMPLETED", "PLANNED"], ["maintenance_contracts", "EXPIRED", "ACTIVE"]] as const
  it.each(work)("refuses to reopen historical %s on a deactivated site", async (kind, closed, opened) => {
    const source = await stage(kind, { status: closed })
    await importMigrationRun(runId)
    await db.customerSite.update({ where: { id: fixture.site.id }, data: { archivedAt: new Date() } })
    const changed = await db.sourceRecord.update({ where: { id: source.id }, data: { checksum: "fictional-new-state", payload: { ...source.payload as Record<string, string>, status: opened } } })
    const before = await fixture.snapshot()
    await expect(importMigrationRun(runId)).rejects.toThrow("Site client introuvable ou désactivé")
    expect(await fixture.snapshot()).toEqual(before)
    expect(await db.sourceRecord.findUniqueOrThrow({ where: { id: source.id } })).toEqual(changed)
  })
  it.each(work)("retains closed %s metadata updates without reactivating their site", async (kind, closed) => {
    await stage(kind, { status: closed })
    await importMigrationRun(runId)
    const archivedAt = new Date("2030-01-01T12:00:00Z")
    await db.customerSite.update({ where: { id: fixture.site.id }, data: { archivedAt } })
    await expect(importMigrationRun(runId)).resolves.toMatchObject({ imported: 1 })
    expect((await db.customerSite.findUniqueOrThrow({ where: { id: fixture.site.id } })).archivedAt).toEqual(archivedAt)
  })
})
