import { Prisma } from "@/generated/prisma/client"

export const sqliteColumnsQuery = Prisma.sql`
  SELECT m.name AS "tableName", p.name AS "columnName", p.type AS "dataType", p."notnull" AS "notNull"
  FROM sqlite_schema m JOIN pragma_table_info(m.name) p WHERE m.type = 'table'`
export const migrationHistoryQuery = (schema: string) => Prisma.sql`
  SELECT migration_name AS "migrationName", checksum, finished_at AS "finishedAt", rolled_back_at AS "rolledBackAt"
  FROM ${Prisma.raw(`"${schema.replace(/"/g, '""')}"`)}."_prisma_migrations"`
export const postgresColumnsQuery = (schema: string) => Prisma.sql`
  SELECT c.relname::text AS "tableName", a.attname::text AS "columnName",
    pg_catalog.format_type(a.atttypid, NULL) AS "dataType", a.attnotnull AS "notNull"
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
  WHERE n.nspname = ${schema} AND c.relkind IN ('r', 'p') AND a.attnum > 0 AND NOT a.attisdropped`

// Metadata only. The migration identifier is restricted to the configured schema.
const statements = new Set([sqliteColumnsQuery.sql, postgresColumnsQuery("").sql])
export function isReadinessMetadataQuery(operation: string, sql: unknown) {
  if (operation !== "$queryRaw" || typeof sql !== "string") return false
  if (statements.has(sql)) return true
  const url = process.env.DATABASE_URL ?? ""
  if (!url.startsWith("postgresql:") && !url.startsWith("postgres:")) return false
  try { return sql === migrationHistoryQuery(new URL(url).searchParams.get("schema") || "public").sql } catch { return false }
}
