import { createDatabaseClient } from "@/lib/database-client"
import { Prisma } from "@/generated/prisma/client"
import { afterAll, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
import { sqlTimestamp as timestamp } from "@/lib/sql-timestamp"

const db = createDatabaseClient()
const sqlite = process.env.DATABASE_URL?.startsWith("file:")

afterAll(() => db.$disconnect())

it.each(["2030-01-12T10:20:30.123Z", "2030-07-12T10:20:30.123Z"])("preserves ORM instants and version checks in raw SQL (%s)", async instant => {
  for (const zone of sqlite ? ["SQLite"] : ["UTC", "Europe/Paris", "America/New_York"]) {
    await db.$transaction(async tx => {
      if (!sqlite) await tx.$queryRaw`SELECT set_config('TimeZone', ${zone}, true)`
      const original = new Date(instant), next = new Date(original.getTime() + 1)
      const row = await tx.user.create({ data: { name: "Fictional timestamp regression", updatedAt: original } })
      const changed = await tx.$executeRaw(Prisma.sql`UPDATE "User" SET "updatedAt" = ${timestamp(next)} WHERE "id" = ${row.id} AND "updatedAt" = ${timestamp(original)}`)
      expect(changed, zone).toBe(1)
      expect((await tx.user.findUniqueOrThrow({ where: { id: row.id } })).updatedAt, zone).toEqual(next)
      const stale = await tx.$executeRaw(Prisma.sql`UPDATE "User" SET "updatedAt" = ${timestamp(original)} WHERE "id" = ${row.id} AND "updatedAt" = ${timestamp(original)}`)
      expect(stale, zone).toBe(0)
      const occupied = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${row.id} AND "updatedAt" > ${timestamp(original)} AND "updatedAt" < ${timestamp(new Date(next.getTime() + 1))}`)
      expect(occupied, zone).toEqual([{ id: row.id }])
      await tx.user.delete({ where: { id: row.id } })
    })
  }
})
