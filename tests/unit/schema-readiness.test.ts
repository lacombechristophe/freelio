import { createHash } from "node:crypto"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterAll, afterEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
import { migrationHistoryMatches, readMigrationManifest, schemaColumnsMatch, type MigrationHistory, type SchemaColumn } from "@/lib/schema-readiness"
import { isReadinessMetadataQuery, migrationHistoryQuery, postgresColumnsQuery, sqliteColumnsQuery } from "@/lib/database-metadata-sql"

describe("Database model readiness", () => {
  const model = (type = "String", required = true) => [{ name: "FictionalModel", fields: [{ name: "value", kind: "scalar", type, isRequired: required }] }]
  const column = (dataType: string, notNull: SchemaColumn["notNull"] = true): SchemaColumn => ({ tableName: "FictionalModel", columnName: "value", dataType, notNull })
  it.each([
    ["String", "TEXT", "text"], ["Int", "INTEGER", "integer"], ["BigInt", "BIGINT", "bigint"],
    ["Boolean", "BOOLEAN", "boolean"], ["DateTime", "DATETIME", "timestamp without time zone"],
    ["Float", "REAL", "double precision"], ["Decimal", "DECIMAL", "numeric"], ["Json", "JSONB", "jsonb"], ["Bytes", "BLOB", "bytea"],
  ])("checks the native %s column type on both providers", (type, sqlite, postgres) => {
    expect(schemaColumnsMatch(model(type), [column(sqlite, BigInt(1))], "sqlite")).toBe(true)
    expect(schemaColumnsMatch(model(type), [column(postgres)], "postgresql")).toBe(true)
  })
  it("rejects an absent table or column and an incompatible type", () => {
    expect(schemaColumnsMatch(model(), [], "sqlite")).toBe(false)
    expect(schemaColumnsMatch(model(), [{ ...column("TEXT"), tableName: "Other" }], "sqlite")).toBe(false)
    expect(schemaColumnsMatch(model(), [{ ...column("TEXT"), columnName: "other" }], "sqlite")).toBe(false)
    expect(schemaColumnsMatch(model("Int"), [column("text")], "postgresql")).toBe(false)
  })
  it("checks both directions of nullability instead of treating a table as sufficient", () => {
    expect(schemaColumnsMatch(model(), [column("TEXT", BigInt(0))], "sqlite")).toBe(false)
    expect(schemaColumnsMatch(model("String", false), [column("text", true)], "postgresql")).toBe(false)
    expect(schemaColumnsMatch(model("String", false), [column("TEXT", 0)], "sqlite")).toBe(true)
  })
  it("uses physical table/column names and ignores relation fields and extra database columns", () => {
    const models = [{ name: "LogicalModel", dbName: "FictionalModel", fields: [{ name: "logical", dbName: "value", kind: "scalar", type: "String", isRequired: true }, { name: "relation", kind: "object", type: "OtherModel", isRequired: true }] }]
    expect(schemaColumnsMatch(models, [column("text"), { ...column("text"), columnName: "historical_extra" }], "postgresql")).toBe(true)
  })
  it("does not accept an empty model manifest or an unknown scalar type", () => {
    expect(schemaColumnsMatch([], [], "sqlite")).toBe(false)
    expect(schemaColumnsMatch(model("Unknown"), [column("TEXT")], "sqlite")).toBe(false)
  })
})

describe("Migration history readiness", () => {
  const expected = [{ migrationName: "20300101000000_initial", checksum: "a".repeat(64) }, { migrationName: "20300102000000_next", checksum: "b".repeat(64) }]
  const complete = (): MigrationHistory[] => expected.map(entry => ({ ...entry, finishedAt: new Date("2030-01-03"), rolledBackAt: null }))
  it("accepts completed migrations regardless of database row order", () => {
    expect(migrationHistoryMatches(expected, complete().reverse())).toBe(true)
  })
  it.each(["missing", "unfinished", "checksum", "duplicate", "unknown"])("rejects a %s migration state", kind => {
    const history = complete()
    if (kind === "missing") history.pop()
    if (kind === "unfinished") history[1]!.finishedAt = null
    if (kind === "checksum") history[1]!.checksum = "c".repeat(64)
    if (kind === "duplicate") history[1] = { ...history[0]! }
    if (kind === "unknown") history[1]!.migrationName = "20300103000000_unknown"
    expect(migrationHistoryMatches(expected, history)).toBe(false)
  })
  it("ignores explicitly rolled-back attempts but still requires their successful replacement", () => {
    const rolledBack = { ...complete()[1]!, finishedAt: null, rolledBackAt: new Date("2030-01-03") }
    expect(migrationHistoryMatches(expected, [...complete(), rolledBack])).toBe(true)
    expect(migrationHistoryMatches(expected, [complete()[0]!, rolledBack])).toBe(false)
  })
  it("rejects a future unfinished migration and empty or duplicated expected histories", () => {
    expect(migrationHistoryMatches(expected, [...complete(), { migrationName: "next", checksum: "c".repeat(64), finishedAt: null, rolledBackAt: null }])).toBe(false)
    expect(migrationHistoryMatches([], [])).toBe(false)
    expect(migrationHistoryMatches([expected[0]!, expected[0]!], complete())).toBe(false)
  })
})

describe("Migration files and metadata allowlist", () => {
  const folders: string[] = []
  afterEach(() => { vi.unstubAllEnvs() })
  afterAll(() => {
    for (const folder of folders) {
      const resolved = path.resolve(folder)
      if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith("Freelio-schema-fixture-")) throw Error("Unexpected fixture cleanup path")
      rmSync(resolved, { recursive: true })
    }
  })
  it("hashes the exact migration bytes and ignores the provider lock file", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "Freelio-schema-fixture-")); folders.push(root)
    const name = "20300101000000_fictional", sql = "SELECT 1;\r\n"
    mkdirSync(path.join(root, name)); writeFileSync(path.join(root, name, "migration.sql"), sql)
    writeFileSync(path.join(root, "migration_lock.toml"), 'provider = "postgresql"')
    const manifest = await readMigrationManifest(root)
    expect(manifest).toMatchObject([{ migrationName: name, checksum: createHash("sha256").update(Buffer.from(sql)).digest("hex") }])
    const lfDigest = createHash("sha256").update("SELECT 1;\n").digest()
    for (const checksum of [lfDigest.toString("hex"), Array.from(lfDigest, byte => byte.toString(16)).join("")]) {
      expect(migrationHistoryMatches(manifest, [{ migrationName: name, checksum, finishedAt: new Date("2030-01-01"), rolledBackAt: null }])).toBe(true)
    }
    expect(migrationHistoryMatches(manifest, [{ migrationName: name, checksum: createHash("sha256").update("SELECT 2;\n").digest("hex"), finishedAt: new Date("2030-01-01"), rolledBackAt: null }])).toBe(false)
  })
  it("fails when a migration directory is packaged without its SQL file", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "Freelio-schema-fixture-")); folders.push(root)
    mkdirSync(path.join(root, "20300101000000_missing"))
    await expect(readMigrationManifest(root)).rejects.toThrow()
  })
  it("preserves the checksum of the applied contract archive migration across checkouts", async () => {
    const manifest = await readMigrationManifest(path.resolve("prisma/postgresql/migrations"))
    expect(manifest.find(entry => entry.migrationName === "20261004040000_signed_contract_archives")?.checksum)
      .toBe("f38ead0097946338f684fa3d53beb5b98fc6cb2a6251c74e985269229e0d834a")
  })
  it("allows only the exact typed metadata queries, never executable SQL variants", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://fictional:fictional@invalid.example.test/fictitious")
    for (const query of [sqliteColumnsQuery, migrationHistoryQuery("public"), postgresColumnsQuery("public")]) {
      expect(isReadinessMetadataQuery("$queryRaw", query.sql)).toBe(true)
      expect(isReadinessMetadataQuery("$queryRawUnsafe", query.sql)).toBe(false)
      expect(isReadinessMetadataQuery("$executeRaw", query.sql)).toBe(false)
      expect(isReadinessMetadataQuery("$queryRaw", `${query.sql}; DELETE FROM "User"`)).toBe(false)
    }
    expect(isReadinessMetadataQuery("$queryRaw", 'SELECT * FROM "User"')).toBe(false)
  })
  it("binds catalog scope and quotes the fixed migration table namespace", () => {
    const schema = 'fictional"; DROP TABLE "User"; --'
    const query = postgresColumnsQuery(schema)
    expect(query.sql).not.toContain(schema)
    expect(query.values).toEqual([schema])
    const history = migrationHistoryQuery(schema)
    expect(history.sql).toContain('FROM "fictional""; DROP TABLE ""User""; --"."_prisma_migrations"')
    const url = new URL("postgresql://fictional:fictional@invalid.example.test/fictitious")
    vi.stubEnv("DATABASE_URL", url.toString())
    expect(isReadinessMetadataQuery("$queryRaw", history.sql)).toBe(false)
    url.searchParams.set("schema", schema); vi.stubEnv("DATABASE_URL", url.toString())
    expect(isReadinessMetadataQuery("$queryRaw", history.sql)).toBe(true)
    expect(isReadinessMetadataQuery("$queryRaw", migrationHistoryQuery("public").sql)).toBe(false)
  })
})
