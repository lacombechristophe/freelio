import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { DatabaseSync } from "node:sqlite"
import { fileURLToPath } from "node:url"

// Always use a new external fictional database, never the application URL.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const directory = mkdtempSync(path.join(os.tmpdir(), "freelio-sync-attempt-upgrade-")), databaseFile = path.join(directory, "historical.db")
const schema = readFileSync(path.join(root, "prisma/schema.prisma"), "utf8")
const previous = schema.replace(/^.*syncAttemptCursor.*\r?\n/gm, "")
assert.notEqual(previous, schema); assert.doesNotMatch(previous, /syncAttemptCursor/)
const beforeSchema = path.join(directory, "before.prisma")
writeFileSync(beforeSchema, previous)
new DatabaseSync(databaseFile).close()
const run = (args, input) => {
  const result = spawnSync(process.execPath, [path.join(root, "node_modules/prisma/build/index.js"), ...args], { cwd: root, windowsHide: true, encoding: "utf8", input,
    env: { ...process.env, DATABASE_URL: `file:${databaseFile.replaceAll("\\", "/")}` } })
  if (result.error) throw result.error
  assert.equal(result.status, 0, result.stderr || result.stdout)
  return result.stdout
}
run(["db", "push", "--skip-generate", "--schema", beforeSchema])
let db = new DatabaseSync(databaseFile)
const date = Date.parse("2026-01-05T12:00:00.000Z")
db.prepare('INSERT INTO "Company" ("id", "name") VALUES (?, ?)').run("company", "Fictional historical scheduling")
for (const [id, status, lastSyncAt] of [["mail", "ACTIVE", date], ["calendar", "ACTIVE", null], ["inactive", "INACTIVE", null]]) {
  db.prepare('INSERT INTO "CommunicationChannel" ("id", "companyId", "provider", "emailAddress", "status", "credentialsEncrypted", "config", "lastSyncAt", "lastError", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, "company", "GOOGLE", `${id}@example.test`, status, "fictional-encrypted-credential-bytes", JSON.stringify({ mailSyncGeneration: "historical", emailSync: { retained: true }, calendarSync: { retained: true } }), lastSyncAt, id === "inactive" ? "Historical failure" : null, date)
}
const tables = ["Company", "CommunicationChannel"]
const snapshot = () => Object.fromEntries(tables.map(table => [table, db.prepare(`SELECT * FROM "${table}" ORDER BY "id"`).all().map(row => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "syncAttemptCursor")))]))
const before = snapshot(); db.close()
const sqliteDiff = run(["migrate", "diff", "--from-schema-datamodel", beforeSchema, "--to-schema-datamodel", path.join(root, "prisma/schema.prisma"), "--script"])
assert.doesNotMatch(sqliteDiff, /\b(DROP|DELETE|UPDATE|RENAME)\b/i)
run(["db", "execute", "--stdin", "--schema", path.join(root, "prisma/schema.prisma")], sqliteDiff)
db = new DatabaseSync(databaseFile)
assert.deepEqual(snapshot(), before)
assert.equal(db.prepare('SELECT COUNT(*) AS "count" FROM "CommunicationChannel" WHERE "syncAttemptCursor" IS NULL').get().count, 3)
assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), [])
const plan = db.prepare('EXPLAIN QUERY PLAN SELECT "id" FROM "CommunicationChannel" WHERE "status" = ? ORDER BY "syncAttemptCursor" ASC NULLS FIRST, "id" ASC LIMIT 25').all("ACTIVE")
assert.ok(plan.some(row => row.detail.includes("CommunicationChannel_sync_attempt_idx")))
db.close()
const postgresBefore = path.join(directory, "before-postgres.prisma")
writeFileSync(postgresBefore, previous.replace('provider = "sqlite"', 'provider = "postgresql"'))
const diff = run(["migrate", "diff", "--from-schema-datamodel", postgresBefore, "--to-schema-datamodel", path.join(root, "prisma/postgresql/schema.prisma"), "--script"])
const normalize = value => value.replace(/^--.*$/gm, "").replace(/\s+/g, " ").trim()
assert.equal(normalize(diff), normalize(readFileSync(path.join(root, "prisma/postgresql/migrations/20261020040000_sync_attempt_cursor/migration.sql"), "utf8")))
const hash = value => createHash("sha256").update(value).digest("hex")
console.log(JSON.stringify({ success: true, engine: "SQLite", preservedRows: 4, historicalChannels: 3, previousSchemaSha256: hash(previous), schemaSha256: hash(schema), databaseFile,
  newCursorsDefaultToNull: true, successesCredentialsCheckpointsAndErrorsPreserved: true, foreignKeyErrors: 0, sqliteQueueIndexUsed: true, postgresDiffMatchesMigration: true, postgresMigrationExecuted: false }, null, 2))
