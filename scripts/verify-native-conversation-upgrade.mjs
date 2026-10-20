import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { DatabaseSync } from "node:sqlite"
import { fileURLToPath } from "node:url"

// External fictional database only; no app URL, secrets, generated client or provider.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const directory = mkdtempSync(path.join(os.tmpdir(), "freelio-native-conversation-upgrade-")), databaseFile = path.join(directory, "historical.db")
const schema = readFileSync(path.join(root, "prisma/schema.prisma"), "utf8")
const previous = schema.replace(/^.*providerConversationId.*\r?\n/gm, "")
assert.notEqual(previous, schema)
assert.doesNotMatch(previous, /providerConversationId/)
const beforeSchema = path.join(directory, "before.prisma")
writeFileSync(beforeSchema, previous)
new DatabaseSync(databaseFile).close()
function push(file) {
  const result = spawnSync(process.execPath, [path.join(root, "node_modules/prisma/build/index.js"), "db", "push", "--skip-generate", "--schema", file], {
    cwd: root, windowsHide: true, encoding: "utf8", env: { ...process.env, DATABASE_URL: `file:${databaseFile.replaceAll("\\", "/")}` },
  })
  if (result.error) throw result.error
  assert.equal(result.status, 0, result.stderr || result.stdout)
}
push(beforeSchema)
let db = new DatabaseSync(databaseFile)
const date = Date.parse("2026-01-05T12:00:00.000Z")
db.prepare('INSERT INTO "Company" ("id", "name") VALUES (?, ?)').run("company", "Fictional historical mail")
db.prepare('INSERT INTO "CommunicationChannel" ("id", "companyId", "provider", "emailAddress", "updatedAt") VALUES (?, ?, ?, ?, ?)')
  .run("channel", "company", "GOOGLE", "fictional@example.test", date)
db.prepare('INSERT INTO "EmailThread" ("id", "companyId", "channelId", "subject", "status", "unreadCount", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?)')
  .run("thread", "company", "channel", "Historical mixed dossier", "ARCHIVED", 7, date)
for (const id of ["old-a", "old-b"]) {
  db.prepare('INSERT INTO "EmailMessage" ("id", "companyId", "threadId", "provider", "providerId", "direction", "fromAddress", "toAddresses", "subject", "bodyText", "status", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, "company", "thread", "GOOGLE", `channel:${id}`, "INBOUND", "fictional@example.test", '["recipient@example.test"]', "Historical subject", `Retained ${id}`, "RECEIVED", date)
}
db.prepare('INSERT INTO "EmailDelivery" ("id", "companyId", "channelId", "recipientEmail", "subject", "provider", "providerId", "status", "scheduledAt", "sentAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
  .run("command", "company", "channel", "recipient@example.test", "Historical command", "GOOGLE", "channel:accepted", "SENT", date, date, date)
const tables = ["Company", "CommunicationChannel", "EmailThread", "EmailMessage", "EmailDelivery"]
const snapshot = () => Object.fromEntries(tables.map(table => [table, db.prepare(`SELECT * FROM "${table}" ORDER BY "id"`).all().map(row => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "providerConversationId")))]))
const before = snapshot(); db.close()
const sqliteDiff = spawnSync(process.execPath, [path.join(root, "node_modules/prisma/build/index.js"), "migrate", "diff", "--from-schema-datamodel", beforeSchema, "--to-schema-datamodel", path.join(root, "prisma/schema.prisma"), "--script"], { cwd: root, windowsHide: true, encoding: "utf8" })
assert.equal(sqliteDiff.status, 0, sqliteDiff.stderr)
assert.doesNotMatch(sqliteDiff.stdout, /\b(DROP|DELETE|UPDATE|RENAME)\b/i)
const applied = spawnSync(process.execPath, [path.join(root, "node_modules/prisma/build/index.js"), "db", "execute", "--stdin", "--schema", path.join(root, "prisma/schema.prisma")], {
  cwd: root, windowsHide: true, input: sqliteDiff.stdout, encoding: "utf8", env: { ...process.env, DATABASE_URL: `file:${databaseFile.replaceAll("\\", "/")}` },
})
assert.equal(applied.status, 0, applied.stderr)
db = new DatabaseSync(databaseFile)
assert.deepEqual(snapshot(), before)
for (const table of ["EmailThread", "EmailDelivery"]) assert.equal(db.prepare(`SELECT COUNT(*) AS "count" FROM "${table}" WHERE "providerConversationId" IS NULL`).get().count, 1)
assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), [])
db.close()
const postgresBefore = path.join(directory, "before-postgres.prisma")
writeFileSync(postgresBefore, previous.replace('provider = "sqlite"', 'provider = "postgresql"'))
const diff = spawnSync(process.execPath, [path.join(root, "node_modules/prisma/build/index.js"), "migrate", "diff", "--from-schema-datamodel", postgresBefore, "--to-schema-datamodel", path.join(root, "prisma/postgresql/schema.prisma"), "--script"], { cwd: root, windowsHide: true, encoding: "utf8" })
assert.equal(diff.status, 0, diff.stderr)
const normalize = value => value.replace(/^--.*$/gm, "").replace(/\s+/g, " ").trim()
const migration = readFileSync(path.join(root, "prisma/postgresql/migrations/20261020030000_native_mail_conversations/migration.sql"), "utf8")
assert.equal(normalize(diff.stdout), normalize(migration))
const hash = value => createHash("sha256").update(value).digest("hex")
console.log(JSON.stringify({ success: true, engine: "SQLite", preservedRows: 6, preservedTables: tables, historicalAssignmentsUnchanged: true, newIdentityDefaultsToNull: true,
  foreignKeyErrors: 0, postgresDiffMatchesMigration: true, postgresMigrationExecuted: false, previousSchemaSha256: hash(previous), schemaSha256: hash(schema), databaseFile }, null, 2))
