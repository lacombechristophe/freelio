import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { DatabaseSync } from "node:sqlite"
import { fileURLToPath } from "node:url"

// A fresh external database only. Never use the application's URL or credentials.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const directory = mkdtempSync(path.join(os.tmpdir(), "freelio-provider-failure-upgrade-"))
const databaseFile = path.join(directory, "historical.db")
const schema = readFileSync(path.join(root, "prisma/schema.prisma"), "utf8")
const previous = schema.replace(/^.*providerFailureKind.*\r?\n/gm, "")
assert.notEqual(previous, schema)
const beforeSchema = path.join(directory, "before.prisma")
writeFileSync(beforeSchema, previous)
function run(args) {
  const result = spawnSync(process.execPath, [path.join(root, "node_modules/prisma/build/index.js"), ...args], { cwd: root, windowsHide: true, encoding: "utf8",
    env: { ...process.env, DATABASE_URL: `file:${databaseFile.replaceAll("\\", "/")}` } })
  if (result.error) throw result.error
  assert.equal(result.status, 0, result.stderr)
  return result.stdout
}
const db = new DatabaseSync(databaseFile)
db.exec(run(["migrate", "diff", "--from-empty", "--to-schema-datamodel", beforeSchema, "--script"]))
db.prepare('INSERT INTO "Company" ("id", "name") VALUES (?, ?)').run("company", "Fictional failure upgrade")
const at = Date.parse("2035-01-02T12:00:00Z")
db.prepare('INSERT INTO "CommunicationChannel" ("id", "companyId", "provider", "emailAddress", "status", "credentialsEncrypted", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?)')
  .run("mailbox", "company", "RESEND", "sender@example.test", "ACTIVE", "fictional-ciphertext", at)
for (const [id, status, providerId, sentAt, nextAttemptAt, attempts] of [["accepted", "SENT", "fictional-accepted", at, null, 1], ["uncertain", "FAILED", null, null, at + 3_600_000, 2]]) {
  db.prepare('INSERT INTO "EmailDelivery" ("id", "companyId", "channelId", "recipientEmail", "subject", "status", "provider", "providerId", "sentAt", "nextAttemptAt", "firstAttemptAt", "attempts", "scheduledAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, "company", "mailbox", "recipient@example.test", "Fiction only", status, "RESEND", providerId, sentAt, nextAttemptAt, at, attempts, at, at)
}
const tables = ["Company", "CommunicationChannel", "EmailDelivery"]
const snapshot = () => Object.fromEntries(tables.map(table => [table, db.prepare(`SELECT * FROM "${table}" ORDER BY "id"`).all().map(row => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "providerFailureKind")))]))
const before = snapshot()
const sqliteDiff = run(["migrate", "diff", "--from-schema-datamodel", beforeSchema, "--to-schema-datamodel", path.join(root, "prisma/schema.prisma"), "--script"])
assert.doesNotMatch(sqliteDiff, /\b(DROP|DELETE|UPDATE|RENAME)\b/i)
db.exec(sqliteDiff)
assert.deepEqual(snapshot(), before)
assert.equal(db.prepare('SELECT COUNT(*) AS "count" FROM "EmailDelivery" WHERE "providerFailureKind" IS NOT NULL').get().count, 0)
assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), [])
db.close()
const postgresBefore = path.join(directory, "before-postgres.prisma"), postgresAfter = path.join(directory, "after-postgres.prisma")
writeFileSync(postgresBefore, previous.replace('provider = "sqlite"', 'provider = "postgresql"'))
writeFileSync(postgresAfter, schema.replace('provider = "sqlite"', 'provider = "postgresql"'))
const postgresDiff = run(["migrate", "diff", "--from-schema-datamodel", postgresBefore, "--to-schema-datamodel", postgresAfter, "--script"])
const normalize = value => value.replace(/^--.*$/gm, "").replace(/\s+/g, " ").trim()
assert.equal(normalize(postgresDiff), normalize(readFileSync(path.join(root, "prisma/postgresql/migrations/20261021010000_mail_provider_failure_kind/migration.sql"), "utf8")))
const hash = value => createHash("sha256").update(value).digest("hex")
console.log(JSON.stringify({ success: true, engine: "SQLite", preservedRows: 4, preservedTables: tables, historicalFailuresUnclassified: true, acceptedAndUncertainCommandsPreserved: true,
  foreignKeyErrors: 0, postgresDiffMatchesMigration: true, postgresMigrationExecuted: false, previousSchemaSha256: hash(previous), schemaSha256: hash(schema), databaseFile }, null, 2))
