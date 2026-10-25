import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { DatabaseSync } from "node:sqlite"
import { fileURLToPath } from "node:url"

// Create an external fixture; do not read application URLs or credentials.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const directory = mkdtempSync(path.join(os.tmpdir(), "freelio-delivery-seal-upgrade-"))
const databaseFile = path.join(directory, "historical.db")
const schema = readFileSync(path.join(root, "prisma/schema.prisma"), "utf8")
const begin = schema.indexOf("model DeliveryNote {"), end = schema.indexOf("model DeliveryNoteLine {", begin)
assert(begin > 0 && end > begin)
const block = schema.slice(begin, end).replace(/^.*(?:signedDocument|sealVersion).*\r?\n/gm, "")
const previous = schema.slice(0, begin) + block + schema.slice(end)
assert.notEqual(previous, schema)
const beforeSchema = path.join(directory, "before.prisma")
writeFileSync(beforeSchema, previous)
function run(args) {
  const result = spawnSync(process.execPath, [path.join(root, "node_modules/prisma/build/index.js"), ...args], { cwd: root, encoding: "utf8", windowsHide: true,
    env: { ...process.env, DATABASE_URL: `file:${databaseFile.replaceAll("\\", "/")}` } })
  if (result.error) throw result.error
  assert.equal(result.status, 0, result.stderr)
  return result.stdout
}
const db = new DatabaseSync(databaseFile)
db.exec(run(["migrate", "diff", "--from-empty", "--to-schema", beforeSchema, "--script"]))
const at = Date.parse("2035-01-02T12:00:00Z")
db.prepare('INSERT INTO "Company" ("id", "name") VALUES (?, ?)').run("company", "Fictional historical delivery")
db.prepare('INSERT INTO "Client" ("id", "companyId", "name", "updatedAt") VALUES (?, ?, ?, ?)').run("client", "company", "Fictional recipient", at)
db.prepare('INSERT INTO "CustomerOrder" ("id", "companyId", "clientId", "number", "updatedAt") VALUES (?, ?, ?, ?, ?)').run("order", "company", "client", "FICTION", at)
db.prepare('INSERT INTO "CustomerOrderLine" ("id", "customerOrderId", "label", "quantity", "deliveredQuantity", "unitPriceCents") VALUES (?, ?, ?, ?, ?, ?)').run("line", "order", "Fictional historical goods", 2, 2, 100)
for (const [id, status, signedAt, digest] of [["signed", "SIGNED", at, "a".repeat(64)], ["unsigned", "DELIVERED", null, null]]) {
  db.prepare('INSERT INTO "DeliveryNote" ("id", "companyId", "customerOrderId", "number", "status", "signedAt", "signatureSha256", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, "company", "order", id, status, signedAt, digest, at)
  db.prepare('INSERT INTO "DeliveryNoteLine" ("id", "deliveryNoteId", "customerOrderLineId", "label", "quantity") VALUES (?, ?, ?, ?, ?)').run(`line-${id}`, id, "line", "Fictional historical goods", 1)
}
const tables = ["Company", "Client", "CustomerOrder", "CustomerOrderLine", "DeliveryNote", "DeliveryNoteLine"]
const snapshot = () => Object.fromEntries(tables.map(table => [table, db.prepare(`SELECT * FROM "${table}" ORDER BY "id"`).all().map(row => Object.fromEntries(Object.entries(row).filter(([key]) => !["signedDocument", "sealVersion"].includes(key))))]))
const before = snapshot()
const diff = run(["migrate", "diff", "--from-schema", beforeSchema, "--to-schema", path.join(root, "prisma/schema.prisma"), "--script"])
assert.doesNotMatch(diff, /\b(DROP|DELETE|UPDATE|RENAME)\b/i)
db.exec(diff)
assert.deepEqual(snapshot(), before)
assert.equal(db.prepare('SELECT COUNT(*) AS "count" FROM "DeliveryNote" WHERE "signedDocument" IS NOT NULL OR "sealVersion" IS NOT NULL').get().count, 0)
assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), [])
db.close()
const pgBefore = path.join(directory, "before-postgres.prisma"), pgAfter = path.join(directory, "after-postgres.prisma")
writeFileSync(pgBefore, previous.replace('provider = "sqlite"', 'provider = "postgresql"'))
writeFileSync(pgAfter, schema.replace('provider = "sqlite"', 'provider = "postgresql"'))
const pgDiff = run(["migrate", "diff", "--from-schema", pgBefore, "--to-schema", pgAfter, "--script"])
const normalize = value => value.replace(/^--.*$/gm, "").replace(/\s+/g, " ").trim()
assert.equal(normalize(pgDiff), normalize(readFileSync(path.join(root, "prisma/postgresql/migrations/20261021030000_delivery_note_seal/migration.sql"), "utf8")))
const hash = value => createHash("sha256").update(value).digest("hex")
console.log(JSON.stringify({ success: true, engine: "SQLite", preservedRows: 8, preservedTables: tables, historicalSignaturesPreserved: true, historicalDocumentsNotInvented: true,
  foreignKeyErrors: 0, postgresDiffMatchesMigration: true, postgresMigrationExecuted: false, previousSchemaSha256: hash(previous), schemaSha256: hash(schema), databaseFile }, null, 2))
