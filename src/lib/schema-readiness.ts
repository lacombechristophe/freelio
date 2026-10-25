import { databaseModels } from "@/generated/schema-metadata"
import "server-only"
import { createHash } from "node:crypto"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { Prisma } from "@/generated/prisma/client"
import prisma from "@/lib/prisma"
import logger from "@/lib/logger"
import { migrationHistoryQuery, postgresColumnsQuery, sqliteColumnsQuery } from "@/lib/database-metadata-sql"

type Provider = "sqlite" | "postgresql"
type Model = { name: string; dbName?: string | null; fields: readonly { name: string; dbName?: string | null; kind: string; type: string; isRequired: boolean }[] }
export type SchemaColumn = { tableName: string; columnName: string; dataType: string; notNull: boolean | number | bigint }
export type MigrationEntry = { migrationName: string; checksum: string; compatibleChecksums?: readonly string[] }
export type MigrationHistory = Pick<MigrationEntry, "migrationName" | "checksum"> & { finishedAt: Date | null; rolledBackAt: Date | null }

const sqliteTypes: Record<string, string> = { String: "text", Int: "integer", BigInt: "bigint", Boolean: "boolean", DateTime: "datetime", Float: "real", Decimal: "decimal", Json: "jsonb", Bytes: "blob" }
const postgresTypes: Record<string, string> = { String: "text", Int: "integer", BigInt: "bigint", Boolean: "boolean", DateTime: "timestamp without time zone", Float: "double precision", Decimal: "numeric", Json: "jsonb", Bytes: "bytea" }

export function schemaColumnsMatch(models: readonly Model[], columns: readonly SchemaColumn[], provider: Provider) {
  if (!models.length) return false
  const actual = new Map(columns.map(column => [`${column.tableName}\0${column.columnName}`, column]))
  const types = provider === "sqlite" ? sqliteTypes : postgresTypes
  return models.every(model => model.fields.filter(field => field.kind !== "object").every(field => {
    const column = actual.get(`${model.dbName ?? model.name}\0${field.dbName ?? field.name}`)
    return column && types[field.type] && column.dataType.toLowerCase() === types[field.type]
      && field.isRequired === (column.notNull === true || column.notNull === 1 || column.notNull === BigInt(1))
  }))
}

export function migrationHistoryMatches(expected: readonly MigrationEntry[], history: readonly MigrationHistory[]) {
  const required = new Map(expected.map(entry => [entry.migrationName, new Set([entry.checksum, ...(entry.compatibleChecksums ?? [])])]))
  const active = history.filter(entry => entry.rolledBackAt == null)
  if (!required.size || required.size !== expected.length || active.length !== required.size) return false
  const names = new Set<string>()
  return active.every(entry => {
    if (entry.finishedAt == null || names.has(entry.migrationName) || !required.get(entry.migrationName)?.has(entry.checksum)) return false
    names.add(entry.migrationName)
    return true
  })
}

export async function readMigrationManifest(directory: string): Promise<MigrationEntry[]> {
  const directories = (await readdir(directory, { withFileTypes: true })).filter(entry => entry.isDirectory())
  return Promise.all(directories.map(async entry => {
    const sql = await readFile(path.join(directory, entry.name, "migration.sql"), "utf8")
    // Match the installed Prisma engine's LF/CRLF and old hex-format rules.
    // prisma-engines 8047c96, schema-connector/src/checksum.rs.
    const digests = [sql, sql.replace(/\r\n/g, "\n"), sql.replace(/\n/g, "\r\n")].map(script => createHash("sha256").update(script).digest())
    return {
      migrationName: entry.name, checksum: digests[0]!.toString("hex"),
      compatibleChecksums: [...new Set(digests.flatMap(digest => [digest.toString("hex"), Array.from(digest, byte => byte.toString(16)).join("")]))],
    }
  }))
}

let manifest: Promise<MigrationEntry[]> | undefined
export async function databaseSchemaReady() {
  const url = process.env.DATABASE_URL ?? ""
  const provider = url.startsWith("file:") ? "sqlite" : url.startsWith("postgresql:") || url.startsWith("postgres:") ? "postgresql" : null
  if (!provider) return false
  const schema = provider === "postgresql" ? new URL(url).searchParams.get("schema") || "public" : ""
  let phase = "migration_files"
  try {
    const expected = provider === "postgresql" ? await (manifest ??= readMigrationManifest(path.join(process.cwd(), "prisma/postgresql/migrations"))) : []
    return await prisma.$transaction(async tx => {
      phase = "columns"
      const query = provider === "sqlite" ? sqliteColumnsQuery : postgresColumnsQuery(schema)
      const columns = await tx.$queryRaw<SchemaColumn[]>(query)
      if (!schemaColumnsMatch(databaseModels, columns, provider)) {
        logger.warn({ event: "schema_readiness_failed", phase, reason: "mismatch", expectedModels: databaseModels.length, observedColumns: columns.length })
        return false
      }
      if (provider === "sqlite") return true
      phase = "migration_history"
      const history = await tx.$queryRaw<MigrationHistory[]>(migrationHistoryQuery(schema))
      const matches = migrationHistoryMatches(expected, history)
      if (!matches) logger.warn({ event: "schema_readiness_failed", phase, reason: "mismatch", expectedMigrations: expected.length, observedMigrations: history.length })
      return matches
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined
    const errorCode = typeof code === "string" && /^(P\d{4}|ENOENT|EACCES|EPERM|ETIMEDOUT)$/.test(code) ? code : "unclassified"
    logger.warn({ event: "schema_readiness_failed", phase, reason: "exception", errorCode })
    throw error
  }
}
