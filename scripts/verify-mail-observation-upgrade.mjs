import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { DatabaseSync } from "node:sqlite"
import { fileURLToPath } from "node:url"

// Always creates an external fictional database. No existing application URL,
// environment file, provider or generated client is used by this verifier.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const directory = mkdtempSync(path.join(os.tmpdir(), "freelio-mail-observation-upgrade-")), databaseFile = path.join(directory, "historical.db")
const schema = readFileSync(path.join(root, "prisma/schema.prisma"), "utf8")
const previous = schema.replace(/^\s*remoteObservation\s+Json\?[^\r\n]*\r?\n/m, "\n")
assert.notEqual(previous, schema)
assert.doesNotMatch(previous, /remoteObservation/)
const beforeSchema = path.join(directory, "before.prisma")
writeFileSync(beforeSchema, previous)
new DatabaseSync(databaseFile).close()
function push(file) {
  const result = spawnSync(process.execPath, [path.join(root, "node_modules/prisma/build/index.js"), "db", "push", "--schema", file], {
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
  .run("thread", "company", "channel", "Historical local dossier", "CLOSED", 0, date)
for (const direction of ["INBOUND", "OUTBOUND"]) {
  db.prepare('INSERT INTO "EmailMessage" ("id", "companyId", "threadId", "provider", "providerId", "direction", "fromAddress", "toAddresses", "bccAddresses", "subject", "bodyText", "attachments", "status", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(direction, "company", "thread", "GOOGLE", `channel:${direction}`, direction, "fictional@example.test", '["recipient@example.test"]', '["hidden@example.test"]',
      "Historical message", "Retained original text", '[{"id":"old-copy","name":"fiction.pdf","sha256":"fictional-historical-hash"}]', direction === "INBOUND" ? "RECEIVED" : "DELIVERED", date)
}
const tables = ["Company", "CommunicationChannel", "EmailThread", "EmailMessage"]
const snapshot = () => Object.fromEntries(tables.map(table => [table, db.prepare(`SELECT * FROM "${table}" ORDER BY "id"`).all().map(row => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "remoteObservation")))]))
const before = snapshot(); db.close(); push(path.join(root, "prisma/schema.prisma")); db = new DatabaseSync(databaseFile)
assert.deepEqual(snapshot(), before)
assert.equal(db.prepare('SELECT COUNT(*) AS "count" FROM "EmailMessage" WHERE "remoteObservation" IS NULL').get().count, 2)
assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), [])
db.close()
const hash = value => createHash("sha256").update(value).digest("hex")
console.log(JSON.stringify({ success: true, engine: "SQLite", preservedTables: tables, preservedRows: 5, historicalMessages: 2, newObservationDefaultsToNull: true,
  noReadStateInvented: true, bodiesCopiesRecipientsAndLocalWorkflowPreserved: true, foreignKeyErrors: 0, previousSchemaSha256: hash(previous), schemaSha256: hash(schema), databaseFile }, null, 2))
