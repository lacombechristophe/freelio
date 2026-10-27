import assert from "node:assert/strict"
import { createHash, randomBytes } from "node:crypto"
import { copyFile, mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath, pathToFileURL } from "node:url"
import { createDatabaseClient } from "../src/lib/database-client.ts"

// This script is copied into scripts/ for execution. It creates its own database
// on the local CI service and never migrates the database in DATABASE_URL.
const profileError = new Error("An explicitly isolated local PostgreSQL recipe is required")
let url
try { url = new URL(process.env.DATABASE_URL || "") } catch { throw profileError }
if (process.env.RECIPE_ISOLATED !== "true" || !["postgres:", "postgresql:"].includes(url.protocol)
  || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  || [...url.searchParams.keys()].some(key => key !== "schema")
  || !(url.pathname === "/crm_test" || url.pathname.startsWith("/freelio_demo_"))) {
  throw profileError
}

if (url.hostname === "localhost") url.hostname = "127.0.0.1"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const require = createRequire(import.meta.url)
const migrationsRoot = path.join(root, "prisma", "postgresql", "migrations")
const checkpoint = "20261023010000_notification_tenant_scope"
const names = (await readdir(migrationsRoot, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort()
const boundary = names.indexOf(checkpoint)
assert(boundary >= 0 && boundary < names.length - 1, "The historical checkpoint must precede the current migrations")
const directory = await mkdtemp(path.join(os.tmpdir(), "Freelio-pg-upgrade-"))
const migrationCopy = path.join(directory, "migrations")
await mkdir(migrationCopy)
await copyFile(path.join(migrationsRoot, "migration_lock.toml"), path.join(migrationCopy, "migration_lock.toml"))
const config = path.join(directory, "prisma.config.mjs")
await writeFile(config, `import { defineConfig } from ${JSON.stringify(pathToFileURL(require.resolve("prisma/config")).href)}\nexport default defineConfig({ schema: ${JSON.stringify(path.join(root, "prisma/postgresql/schema.prisma"))}, migrations: { path: ${JSON.stringify(migrationCopy)} }, datasource: { url: process.env.DATABASE_URL } })\n`)

const database = `freelio_demo_upgrade_${randomBytes(8).toString("hex")}`
assert(/^freelio_demo_upgrade_[a-f0-9]{16}$/.test(database))
const targetUrl = new URL(url)
targetUrl.pathname = `/${database}`
targetUrl.searchParams.set("schema", "public")
const admin = createDatabaseClient(url.href)
let target, created = false
const report = { schema: "freelio.postgres-upgrade.v1", startedAt: new Date().toISOString(), checkpoint, baselineMigrations: boundary + 1, currentMigrations: names.length, checks: [], cleanupSucceeded: false }
const output = path.join(root, "test-results", "postgres-upgrade.json")

function redact(value) {
  let text = String(value)
  for (const secret of [url.href, targetUrl.href, url.password, decodeURIComponent(url.password)].filter(Boolean)) text = text.replaceAll(secret, "[redacted]")
  return text
}

async function copyMigrations(selected) {
  for (const name of selected) {
    await mkdir(path.join(migrationCopy, name), { recursive: true })
    await copyFile(path.join(migrationsRoot, name, "migration.sql"), path.join(migrationCopy, name, "migration.sql"))
  }
}

function deploy() {
  const result = spawnSync(process.execPath, [path.join(root, "node_modules/prisma/build/index.js"), "migrate", "deploy", "--config", config], {
    cwd: root, env: { ...process.env, DATABASE_URL: targetUrl.href }, encoding: "utf8", timeout: 120_000, windowsHide: true,
  })
  if (result.error || result.status !== 0) throw new Error(`PostgreSQL upgrade recipe failed: ${redact(result.stderr || result.error?.message || result.stdout).slice(-2500)}`)
}

async function snapshot() {
  return {
    companies: await target.$queryRawUnsafe('SELECT "id", "name" FROM "Company" ORDER BY "id"'),
    clients: await target.$queryRawUnsafe('SELECT "id", "companyId", "name" FROM "Client" ORDER BY "id"'),
    sites: await target.$queryRawUnsafe('SELECT "id", "companyId", "clientId", "label", "address1" FROM "CustomerSite" ORDER BY "id"'),
    equipment: await target.$queryRawUnsafe('SELECT "id", "companyId", "siteId", "label" FROM "Equipment" ORDER BY "id"'),
    tickets: await target.$queryRawUnsafe('SELECT "id", "companyId", "clientId", "siteId", "title", "priority", "status" FROM "ServiceTicket" ORDER BY "id"'),
  }
}

try {
  await admin.$executeRawUnsafe(`CREATE DATABASE "${database}"`)
  created = true
  await copyMigrations(names.slice(0, boundary + 1))
  deploy()
  target = createDatabaseClient(targetUrl.href)
  // Explicit old-schema columns model existing records; no current Prisma model
  // writes are used before the upgrade, so later columns cannot hide a backfill bug.
  await target.$executeRawUnsafe('INSERT INTO "Company" ("id", "name", "updatedAt") VALUES ($1, $2, CURRENT_TIMESTAMP)', "upgrade-company", "Fictional upgrade company")
  await target.$executeRawUnsafe('INSERT INTO "Client" ("id", "companyId", "name", "updatedAt") VALUES ($1, $2, $3, CURRENT_TIMESTAMP)', "upgrade-client", "upgrade-company", "Fictional upgrade client")
  await target.$executeRawUnsafe('INSERT INTO "CustomerSite" ("id", "companyId", "clientId", "label", "address1", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)', "upgrade-site", "upgrade-company", "upgrade-client", "Fictional upgrade site", "Fictional recipe address")
  await target.$executeRawUnsafe('INSERT INTO "Equipment" ("id", "companyId", "siteId", "label", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)', "upgrade-equipment", "upgrade-company", "upgrade-site", "Fictional upgrade equipment")
  await target.$executeRawUnsafe('INSERT INTO "ServiceTicket" ("id", "companyId", "clientId", "siteId", "number", "title", "description", "priority", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)', "upgrade-ticket", "upgrade-company", "upgrade-client", "upgrade-site", "SAV-UPGRADE-001", "Fictional upgrade ticket", "Fictional upgrade description", "HIGH")
  const before = await snapshot()
  report.checks.push("Historical schema populated with linked fictional records")
  await copyMigrations(names.slice(boundary + 1))
  deploy()
  assert.deepEqual(await snapshot(), before, "Existing identifiers, ownership, relationships and values must survive the upgrade")
  report.checks.push("Existing record projections unchanged after upgrade")
  const journal = await target.$queryRawUnsafe('SELECT "migration_name", "checksum" FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL ORDER BY "migration_name"')
  assert.deepEqual(journal.map(row => row.migration_name), names)
  for (const row of journal) {
    const bytes = await readFile(path.join(migrationsRoot, row.migration_name, "migration.sql"))
    assert.equal(row.checksum, createHash("sha256").update(bytes).digest("hex"))
  }
  report.checks.push("Complete Prisma migration journal matches checked-in SQL checksums")
  const indexes = await target.$queryRawUnsafe('SELECT "indexname" FROM "pg_indexes" WHERE "schemaname" = $1 AND "indexname" IN ($2, $3) ORDER BY "indexname"', "public", "Equipment_companyId_siteId_idx", "ServiceTicket_companyId_priority_updatedAt_id_idx")
  assert.equal(indexes.length, 2)
  const invalid = await target.$queryRawUnsafe('SELECT COUNT(*) AS "count" FROM "pg_index" i JOIN "pg_class" t ON t.oid = i.indrelid JOIN "pg_namespace" n ON n.oid = t.relnamespace WHERE n.nspname = $1 AND NOT i.indisvalid', "public")
  assert.equal(Number(invalid[0].count), 0)
  report.checks.push("Expected scope/priority indexes exist and all public indexes are valid")
  report.recordFingerprint = createHash("sha256").update(JSON.stringify(before)).digest("hex")
  report.success = true
} catch (error) {
  report.success = false
  report.failure = redact(error instanceof Error ? error.message : error)
} finally {
  try {
    await target?.$disconnect()
    if (created) await admin.$executeRawUnsafe(`DROP DATABASE "${database}" WITH (FORCE)`)
    report.cleanupSucceeded = true
  } catch (error) {
    report.cleanupFailure = redact(error instanceof Error ? error.message : error)
  } finally {
    await admin.$disconnect()
    report.completedAt = new Date().toISOString()
    await mkdir(path.dirname(output), { recursive: true })
    await writeFile(output, JSON.stringify(report, null, 2) + "\n")
    console.log(JSON.stringify({ success: report.success, checks: report.checks, cleanupSucceeded: report.cleanupSucceeded }))
  }
}
if (!report.success || !report.cleanupSucceeded) throw new Error(report.failure || report.cleanupFailure || "PostgreSQL upgrade verification failed")
