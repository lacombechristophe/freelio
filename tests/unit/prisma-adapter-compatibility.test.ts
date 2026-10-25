import path from "node:path"
import { pathToFileURL } from "node:url"
import { afterEach, describe, expect, it, vi } from "vitest"
import { databaseConnectionUrl } from "@/lib/database-url"
import { uniqueConstraintTarget } from "@/lib/prisma-constraint"
import { isUniqueConstraintConflict } from "@/lib/document-numbering"
import { onboardingErrorMessage, DUPLICATE_SIRET_MESSAGE } from "@/lib/onboarding-errors"

const mocks = vi.hoisted(() => ({ pg: vi.fn(), sqlite: vi.fn(), client: vi.fn() }))
vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: class { constructor(...args: unknown[]) { mocks.pg(...args) } } }))
vi.mock("@prisma/adapter-better-sqlite3", () => ({ PrismaBetterSqlite3: class { constructor(...args: unknown[]) { mocks.sqlite(...args) } } }))
vi.mock("@/generated/prisma/client", () => ({ PrismaClient: class { constructor(...args: unknown[]) { mocks.client(...args) } } }))
import { createDatabaseClient } from "@/lib/database-client"
afterEach(() => { vi.clearAllMocks() })

describe("Prisma adapter configuration", () => {
  it("resolves old relative paths from prisma and preserves absolute paths and escaped file URLs", () => {
    const absolute = path.resolve("prisma", "fictional date %.db")
    const expected = `file:${absolute.replaceAll("\\", "/")}`
    expect(databaseConnectionUrl("file:./fictional date %.db")).toBe(expected)
    expect(databaseConnectionUrl(`file:${absolute}`)).toBe(expected)
    expect(databaseConnectionUrl(pathToFileURL(absolute).href)).toBe(expected)
  })
  it.each(["", "https://database.example.test", "mysql://fictional@example.test/recipe"])("refuses an unsupported URL: %s", url => {
    expect(() => databaseConnectionUrl(url)).toThrow("DATABASE_URL")
  })
  it("keeps integer milliseconds for existing SQLite files", () => {
    createDatabaseClient("file:./fictional.db")
    expect(mocks.sqlite).toHaveBeenCalledWith({ url: databaseConnectionUrl("file:./fictional.db") }, { timestampFormat: "unixepoch-ms" })
    expect(mocks.pg).not.toHaveBeenCalled()
  })
  it.each(["public", "private_fixture"])("preserves the configured PostgreSQL schema %s with a bounded pool", schema => {
    const url = `postgresql://fictional:fictional@database.example.test/recipe?schema=${schema}`
    createDatabaseClient(url)
    expect(mocks.pg).toHaveBeenCalledWith({ connectionString: url, max: 10, connectionTimeoutMillis: 5_000, idleTimeoutMillis: 300_000 }, { schema })
    expect(mocks.sqlite).not.toHaveBeenCalled()
  })
})

describe("Structured uniqueness metadata", () => {
  const adapter = (constraint: object, kind = "UniqueConstraintViolation", code = "P2002") => ({ code, meta: { driverAdapterError: { cause: { kind, constraint } } } })
  it.each([
    { code: "P2002", meta: { target: ["companyId", "siret"] } },
    adapter({ fields: ["companyId", "siret"] }),
    adapter({ index: "Company_siret_key" }),
  ])("retains the domain refusal for native and adapter errors", error => {
    expect(isUniqueConstraintConflict(error, "siret")).toBe(true)
    expect(isUniqueConstraintConflict(error, "fingerprint")).toBe(false)
    expect(onboardingErrorMessage(error)).toBe(DUPLICATE_SIRET_MESSAGE)
  })
  it.each([null, { code: "P2002" }, adapter({ fields: ["siret"] }, "ForeignKeyConstraintViolation"), adapter({ fields: ["siret"] }, "UniqueConstraintViolation", "P2003")])("does not infer a field from unrelated or incomplete metadata", error => {
    expect(uniqueConstraintTarget(error)).toBeUndefined()
    expect(isUniqueConstraintConflict(error, "siret")).toBe(false)
  })
})
