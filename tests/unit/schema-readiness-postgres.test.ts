import path from "node:path"
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest"
const mock = vi.hoisted(() => ({ query: vi.fn(), transaction: vi.fn(), warn: vi.fn() }))
vi.mock("server-only", () => ({}))
vi.mock("@/lib/logger", () => ({ default: { warn: mock.warn } }))
vi.mock("@/lib/prisma", () => ({ default: { $transaction: mock.transaction } }))
vi.mock("@prisma/client", async importActual => {
  const actual = await importActual<typeof import("@prisma/client")>()
  return { ...actual, Prisma: { ...actual.Prisma, dmmf: { datamodel: { models: [{ name: "FictionalModel", fields: [{ name: "id", type: "String", kind: "scalar", isRequired: true }] }] } } } }
})
import { databaseSchemaReady, readMigrationManifest, type MigrationHistory } from "@/lib/schema-readiness"

describe("PostgreSQL metadata orchestration without a provider connection", () => {
  let history: MigrationHistory[]
  beforeEach(async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://fictional:fictional@invalid.example.test/fictitious?schema=private_fixture")
    history = (await readMigrationManifest(path.resolve("prisma/postgresql/migrations"))).map(entry => ({ ...entry, finishedAt: new Date("2030-01-01"), rolledBackAt: null }))
    mock.transaction.mockReset().mockImplementation(task => task({ $queryRaw: mock.query }))
    mock.warn.mockReset()
    mock.query.mockReset().mockImplementation(query => query.sql.includes("pg_catalog")
      ? Promise.resolve([{ tableName: "FictionalModel", columnName: "id", dataType: "text", notNull: true }]) : Promise.resolve(history))
  })
  afterEach(() => { vi.unstubAllEnvs() })
  it("checks the bound schema and all delivered migration checksums", async () => {
    expect(await databaseSchemaReady()).toBe(true)
    expect(mock.query).toHaveBeenCalledTimes(2)
    expect(mock.query.mock.calls[0]![0].values).toEqual(["private_fixture"])
    expect(mock.query.mock.calls[1]![0].sql).toContain('FROM "private_fixture"."_prisma_migrations"')
    expect(mock.transaction.mock.calls[0]![1]).toEqual({ isolationLevel: "Serializable" })
    expect(mock.warn).not.toHaveBeenCalled()
  })
  it.each(["absent", "running", "modified"])("rejects an %s migration history", async state => {
    if (state === "absent") history.pop()
    if (state === "running") history[0]!.finishedAt = null
    if (state === "modified") history[0]!.checksum = "f".repeat(64)
    expect(await databaseSchemaReady()).toBe(false)
    expect(mock.warn).toHaveBeenCalledWith({ event: "schema_readiness_failed", phase: "migration_history", reason: "mismatch", expectedMigrations: 73, observedMigrations: history.length })
  })
  it("does not cache a successful database state between calls", async () => {
    expect(await databaseSchemaReady()).toBe(true)
    history.pop()
    expect(await databaseSchemaReady()).toBe(false)
  })
  it("uses the default public schema when none is configured", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://fictional:fictional@invalid.example.test/fictitious")
    expect(await databaseSchemaReady()).toBe(true)
    expect(mock.query.mock.calls[0]![0].values).toEqual(["public"])
  })
  it("does not attempt metadata queries for an unsupported provider", async () => {
    vi.stubEnv("DATABASE_URL", "https://invalid.example.test")
    expect(await databaseSchemaReady()).toBe(false)
    expect(mock.transaction).not.toHaveBeenCalled()
  })
  it("propagates an unavailable metadata query for the HTTP boundary to classify safely", async () => {
    mock.query.mockRejectedValueOnce(new Error("Fictional database permission failure"))
    await expect(databaseSchemaReady()).rejects.toThrow("Fictional database permission failure")
    expect(mock.warn).toHaveBeenCalledWith({ event: "schema_readiness_failed", phase: "columns", reason: "exception", errorCode: "unclassified" })
  })
  it("logs a column mismatch without returning database identifiers or column values", async () => {
    mock.query.mockResolvedValueOnce([])
    expect(await databaseSchemaReady()).toBe(false)
    expect(mock.warn).toHaveBeenCalledWith({ event: "schema_readiness_failed", phase: "columns", reason: "mismatch", expectedModels: 1, observedColumns: 0 })
  })
  it.each(["P2010", "ENOENT", "postgresql://private:secret@private.invalid/database"])("filters diagnostic error codes: %s", async code => {
    mock.query.mockRejectedValueOnce(Object.assign(new Error("private provider details"), { code }))
    await expect(databaseSchemaReady()).rejects.toThrow("private provider details")
    expect(mock.warn).toHaveBeenCalledWith({ event: "schema_readiness_failed", phase: "columns", reason: "exception", errorCode: code === "P2010" || code === "ENOENT" ? code : "unclassified" })
    expect(JSON.stringify(mock.warn.mock.calls)).not.toContain("secret")
    expect(JSON.stringify(mock.warn.mock.calls)).not.toContain("private provider details")
  })
})
