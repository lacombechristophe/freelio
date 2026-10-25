import { createDatabaseClient } from "@/lib/database-client"
import { Prisma } from "@/generated/prisma/client"
import { afterAll, afterEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
vi.mock("@/lib/readiness", () => ({ productionConfigurationIssues: () => [] }))
import { GET } from "@/app/api/health/ready/route"
import prisma from "@/lib/prisma"
import { sqliteColumnsQuery } from "@/lib/database-metadata-sql"

const db = createDatabaseClient()
describe.sequential("Readiness checks the usable database schema", () => {
  let renamedTable = false, renamedColumn = false
  afterEach(async () => {
    vi.unstubAllEnvs()
    if (renamedColumn) { await db.$executeRawUnsafe('ALTER TABLE "Notification" RENAME COLUMN "fictionalCompanyId" TO "companyId"'); renamedColumn = false }
    if (renamedTable) { await db.$executeRawUnsafe('ALTER TABLE "Fictional_Readiness_Notification" RENAME TO "Notification"'); renamedTable = false }
  })
  afterAll(async () => { await db.$disconnect() })

  it("accepts the freshly prepared application schema", async () => {
    expect((await GET()).status).toBe(200)
  })
  it("refuses readiness when a model table is missing despite a working connection", async () => {
    await db.$executeRawUnsafe('ALTER TABLE "Notification" RENAME TO "Fictional_Readiness_Notification"'); renamedTable = true
    const response = await GET()
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ status: "not_ready", components: { database: "ok", schema: "error" } })
  })
  it("refuses readiness when a required model column is missing", async () => {
    await db.$executeRawUnsafe('ALTER TABLE "Notification" RENAME COLUMN "companyId" TO "fictionalCompanyId"'); renamedColumn = true
    expect((await GET()).status).toBe(503)
  })
  it("keeps schema checks enabled in the public read-only demo", async () => {
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    expect((await GET()).status).toBe(200)
    await db.$executeRawUnsafe('ALTER TABLE "Notification" RENAME TO "Fictional_Readiness_Notification"'); renamedTable = true
    expect((await GET()).status).toBe(503)
  })
  it("keeps ad hoc raw reads and all executable variants blocked in the public demo", async () => {
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    for (const query of [Prisma.sql`SELECT COUNT(*) FROM "User"`, Prisma.raw(`${sqliteColumnsQuery.sql}; DELETE FROM "Notification"`)]) {
      await expect(async () => await prisma.$queryRaw(query)).rejects.toThrow("lecture seule")
      await expect(prisma.$transaction(async tx => await tx.$queryRaw(query))).rejects.toThrow("lecture seule")
    }
    await expect(prisma.$transaction(async tx => await tx.$executeRaw(sqliteColumnsQuery))).rejects.toThrow("lecture seule")
    await expect(prisma.$transaction(async tx => await tx.$queryRawUnsafe(sqliteColumnsQuery.sql))).rejects.toThrow("lecture seule")
    expect((await GET()).status).toBe(200)
  })
})
