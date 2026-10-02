import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import type { PrismaClient } from "@prisma/client"
const identity = vi.hoisted(() => ({ companyId: "", userId: "" }))
vi.mock("@/auth", () => ({ auth: vi.fn(async () => ({ user: { id: identity.userId }, companyId: identity.companyId })) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("server-only", () => ({}))
import prisma from "@/lib/prisma"
import { importMigrationRun } from "@/actions/migrations"

describe.sequential("Atomic import record and restart", () => {
  let runId = ""
  beforeAll(async () => {
    const company = await prisma.company.create({ data: { name: "Synthetic restart fixture" } })
    const user = await prisma.user.create({ data: { email: "resume-" + company.id + "@example.test", companyId: company.id } })
    identity.companyId = company.id
    identity.userId = user.id
    await prisma.membership.create({ data: { companyId: company.id, userId: user.id, role: "OWNER" } })
    const run = await prisma.migrationRun.create({ data: { companyId: company.id, provider: "EXTRABAT", kind: "MANUAL_ARCHIVE", status: "SIMULATED" } })
    runId = run.id
    await prisma.sourceRecord.create({ data: { runId, companyId: company.id, provider: "EXTRABAT", objectType: "companies", sourceId: "restart-client", payload: { name: "Restart synthetic client" }, checksum: "synthetic" } })
    await prisma.migrationMetric.create({ data: { runId, objectType: "companies", sourceCount: 1, extracted: 1 } })
  })
  afterAll(async () => {
    await prisma.user.update({ where: { id: identity.userId }, data: { companyId: null } })
    await prisma.externalIdMap.deleteMany({ where: { companyId: identity.companyId } })
    await prisma.migrationRun.deleteMany({ where: { companyId: identity.companyId } })
    await prisma.client.deleteMany({ where: { companyId: identity.companyId } })
    await prisma.membership.deleteMany({ where: { companyId: identity.companyId } })
    await prisma.company.delete({ where: { id: identity.companyId } })
    await prisma.user.delete({ where: { id: identity.userId } })
  })
  it("rolls back the created client when mapping fails, then resumes without duplicates", async () => {
    const singleton = globalThis as unknown as { prisma: PrismaClient }
    const original = singleton.prisma
    singleton.prisma = original.$extends({
      query: { externalIdMap: { upsert() { throw new Error("Injected checkpoint failure") } } },
    }) as unknown as PrismaClient
    try {
      await expect(importMigrationRun(runId)).rejects.toThrow("Injected checkpoint failure")
    } finally { singleton.prisma = original }
    expect(await prisma.client.count({ where: { companyId: identity.companyId } })).toBe(0)
    expect(await prisma.externalIdMap.count({ where: { companyId: identity.companyId } })).toBe(0)
    expect((await prisma.migrationRun.findUniqueOrThrow({ where: { id: runId } })).status).toBe("FAILED")
    await expect(importMigrationRun(runId)).resolves.toMatchObject({ imported: 1, rejected: 0 })
    await expect(importMigrationRun(runId)).resolves.toMatchObject({ imported: 1, rejected: 0 })
    expect(await prisma.client.count({ where: { companyId: identity.companyId } })).toBe(1)
  })
  it("refuses an active lease and recovers an expired lease", async () => {
    await prisma.migrationRun.update({ where: { id: runId }, data: { status: "IMPORTING", importLeaseId: "old-lease", importStartedAt: new Date(), importHeartbeatAt: new Date() } })
    await expect(importMigrationRun(runId)).rejects.toThrow("Simulez")
    await prisma.migrationRun.update({ where: { id: runId }, data: { importHeartbeatAt: new Date(Date.now() - 16 * 60_000) } })
    await expect(importMigrationRun(runId)).resolves.toMatchObject({ imported: 1 })
    expect(await prisma.client.count({ where: { companyId: identity.companyId } })).toBe(1)
  })
})
