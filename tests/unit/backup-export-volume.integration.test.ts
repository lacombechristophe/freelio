import { randomUUID } from "node:crypto"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
import prisma from "@/lib/prisma"
import { buildBackupPayload } from "@/lib/backup"
import { verifyReversibilityExport } from "@/lib/backup-integrity"

const id = () => `c${randomUUID().replaceAll("-", "")}`
let companyId = "", foreignCompanyId = "", ownerId = "", sharedUserId = "", foreignUserId = "", categoryId = ""
let ownedUsers: string[] = [], expectedAudits: string[] = []

beforeEach(async () => {
  vi.stubEnv("FILE_STORAGE_DRIVER", "local")
  companyId = (await prisma.company.create({ data: { name: "Fictional complete export" } })).id
  foreignCompanyId = (await prisma.company.create({ data: { name: "Fictional excluded export" } })).id
  ownedUsers = [id(), id(), id()]
  ;[ownerId, sharedUserId, foreignUserId] = ownedUsers
  await prisma.user.createMany({ data: ownedUsers.map(userId => ({ id: userId, email: `${userId}@example.test`, passwordHash: "FICTIONAL-EXCLUDED-PASSWORD" })) })
  await prisma.membership.createMany({ data: [
    { companyId, userId: ownerId, role: "OWNER" }, { companyId, userId: sharedUserId, role: "VIEWER", status: "SUSPENDED" },
    { companyId: foreignCompanyId, userId: sharedUserId, role: "OWNER" }, { companyId: foreignCompanyId, userId: foreignUserId, role: "OWNER" },
  ] })
  categoryId = (await prisma.serviceCategory.create({ data: { companyId, name: "Fictional exported category" } })).id
  const foreignCategory = await prisma.serviceCategory.create({ data: { companyId: foreignCompanyId, name: "Fictional foreign category" } })
  expectedAudits = [id(), id()]
  await prisma.auditLog.createMany({ data: [
    { id: expectedAudits[0], userId: ownerId, action: "UPDATE", resource: "CATEGORY", resourceId: categoryId, payload: { token: "FICTIONAL-EXCLUDED-TOKEN", nested: { credentialsEncrypted: "FICTIONAL-EXCLUDED-CREDENTIALS", amountCents: 123 } } },
    { id: expectedAudits[1], userId: sharedUserId, action: "UPDATE", resource: "CATEGORY", resourceId: categoryId },
    { userId: ownerId, action: "UPDATE", resource: "CATEGORY", resourceId: foreignCategory.id },
    { userId: sharedUserId, action: "UPDATE", resource: "CATEGORY", resourceId: foreignCategory.id },
    { userId: foreignUserId, action: "UPDATE", resource: "CATEGORY", resourceId: categoryId },
    { userId: ownerId, action: "UPDATE", resource: "GLOBAL", resourceId: null },
  ] })
})

afterEach(async () => {
  for (let offset = 0; offset < ownedUsers.length; offset += 100) await prisma.auditLog.deleteMany({ where: { userId: { in: ownedUsers.slice(offset, offset + 100) } } })
  await prisma.serviceCategory.deleteMany({ where: { companyId: { in: [companyId, foreignCompanyId] } } })
  await prisma.membership.deleteMany({ where: { companyId: { in: [companyId, foreignCompanyId] } } })
  await prisma.company.deleteMany({ where: { id: { in: [companyId, foreignCompanyId] } } })
  for (let offset = 0; offset < ownedUsers.length; offset += 100) await prisma.user.deleteMany({ where: { id: { in: ownedUsers.slice(offset, offset + 100) } } })
  vi.unstubAllEnvs()
})

describe.sequential("complete bounded company reversibility export", () => {
  it("exports more than 1,000 resources and every matching audit page without duplicates", async () => {
    const resources = Array.from({ length: 1001 }, (_, index) => ({ id: id(), companyId, name: `Fictional category ${index}` }))
    for (let offset = 0; offset < resources.length; offset += 100) await prisma.serviceCategory.createMany({ data: resources.slice(offset, offset + 100) })
    const audits = Array.from({ length: 501 }, () => ({ id: id(), userId: ownerId, action: "UPDATE", resource: "CATEGORY", resourceId: categoryId }))
    audits.push({ id: id(), userId: ownerId, action: "UPDATE", resource: "CATEGORY", resourceId: resources.at(-1)!.id })
    for (let offset = 0; offset < audits.length; offset += 100) await prisma.auditLog.createMany({ data: audits.slice(offset, offset + 100) })
    const payload = await buildBackupPayload(ownerId, companyId)
    expect(new Set(payload.tables.find(table => table.model === "ServiceCategory")!.rows.map(row => row.id))).toEqual(new Set([categoryId, ...resources.map(row => row.id)]))
    const exportedAudits = payload.tables.find(table => table.model === "AuditLog")!.rows
    expect(exportedAudits).toHaveLength(expectedAudits.length + audits.length)
    expect(new Set(exportedAudits.map(row => row.id))).toEqual(new Set([...expectedAudits, ...audits.map(row => row.id)]))
    expect(payload.manifest.status).toBe("COMPLETE")
    expect(verifyReversibilityExport(payload).ok).toBe(true)
  })

  it("exports all company members above 1,000 while excluding foreign-only users", async () => {
    const users = Array.from({ length: 1001 }, () => ({ id: id(), email: `${randomUUID()}@example.test`, passwordHash: "FICTIONAL-EXCLUDED-PASSWORD" }))
    ownedUsers.push(...users.map(user => user.id))
    for (let offset = 0; offset < users.length; offset += 100) {
      const batch = users.slice(offset, offset + 100)
      await prisma.user.createMany({ data: batch })
      await prisma.membership.createMany({ data: batch.map(user => ({ companyId, userId: user.id, role: "VIEWER" })) })
    }
    const payload = await buildBackupPayload(ownerId, companyId)
    const exportedUsers = payload.tables.find(table => table.model === "User")!.rows
    expect(exportedUsers).toHaveLength(1003)
    expect(new Set(exportedUsers.map(row => row.id))).toEqual(new Set([ownerId, sharedUserId, ...users.map(user => user.id)]))
    expect(verifyReversibilityExport(payload).ok).toBe(true)
    expect(JSON.stringify(payload)).not.toContain("FICTIONAL-EXCLUDED-PASSWORD")
  })

  it("keeps the intersection of company users and exported resources, including shared or inactive members", async () => {
    const payload = await buildBackupPayload(ownerId, companyId)
    expect(new Set(payload.tables.find(table => table.model === "User")!.rows.map(row => row.id))).toEqual(new Set([ownerId, sharedUserId]))
    expect(new Set(payload.tables.find(table => table.model === "AuditLog")!.rows.map(row => row.id))).toEqual(new Set(expectedAudits))
    expect(payload.tables.find(table => table.model === "AuditLog")!.rows.find(row => row.id === expectedAudits[0])!.payload).toEqual({ nested: { amountCents: 123 } })
    const serialized = JSON.stringify(payload)
    for (const secret of ["FICTIONAL-EXCLUDED-PASSWORD", "FICTIONAL-EXCLUDED-TOKEN", "FICTIONAL-EXCLUDED-CREDENTIALS", foreignCompanyId, foreignUserId]) expect(serialized).not.toContain(secret)
    expect(verifyReversibilityExport(payload).ok).toBe(true)
  })

  it("counts user data in the byte budget and preserves it when the logical export is refused", async () => {
    const bytes = 17 * 1024 * 1024
    await prisma.user.update({ where: { id: ownerId }, data: { image: "x".repeat(bytes) } })
    let refused = false
    try { await buildBackupPayload(ownerId, companyId) }
    catch (error) {
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toBe("Export logique trop volumineux : utiliser la sauvegarde native de la base")
      refused = true
    }
    expect(refused).toBe(true)
    const [row] = await prisma.$queryRaw<Array<{ size: number | bigint }>>`SELECT length("image") AS "size" FROM "User" WHERE "id" = ${ownerId}`
    expect(Number(row.size)).toBe(bytes)
    expect(await prisma.auditLog.count({ where: { userId: ownerId } })).toBe(3)
  })
})
