import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { DatabaseSync } from "node:sqlite"
import { fileURLToPath } from "node:url"

// Always creates a new database. No application URL, credentials or existing
// database are read, and no client generation or network access is needed.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const directory = mkdtempSync(path.join(os.tmpdir(), "freelio-asset-upgrade-"))
const databaseFile = path.join(directory, "historical.db")
const schema = readFileSync(path.join(root, "prisma/schema.prisma"), "utf8")
let previous = schema
for (const model of ["CustomerSite", "Equipment"]) {
  const pattern = new RegExp(`model ${model} \\{[\\s\\S]*?^\\}`, "m")
  const block = previous.match(pattern)?.[0]
  assert.ok(block, `Missing model ${model}`)
  const oldBlock = block.replace(/^\s*archivedAt\s+DateTime\?[^\r\n]*\r?\n/m, "\n")
    .replace(/^\s*@@index\(\[companyId, archivedAt\]\)[^\r\n]*\r?\n/m, "\n")
  assert.notEqual(block, oldBlock)
  assert.doesNotMatch(oldBlock, /archivedAt/)
  previous = previous.replace(block, oldBlock)
}
const previousSchema = path.join(directory, "before.prisma")
writeFileSync(previousSchema, previous)
// Creating the file first also works with Prisma versions whose schema engine
// cannot create a SQLite file while evaluating db push.
new DatabaseSync(databaseFile).close()
function push(schemaFile) {
  const result = spawnSync(process.execPath, [path.join(root, "node_modules/prisma/build/index.js"), "db", "push", "--schema", schemaFile], {
    cwd: root, windowsHide: true, encoding: "utf8", env: { ...process.env, DATABASE_URL: `file:${databaseFile.replaceAll("\\", "/")}` },
  })
  if (result.error) throw result.error
  assert.equal(result.status, 0, result.stderr || result.stdout)
}
push(previousSchema)
let db = new DatabaseSync(databaseFile)
const timestamp = Date.parse("2030-01-02T12:00:00.000Z")
const rows = {
  Company: { id: "company", name: "Fictional upgrade company" },
  Client: { id: "client", companyId: "company", name: "Fictional historical client", updatedAt: timestamp },
  CustomerSite: { id: "site", companyId: "company", clientId: "client", label: "Fictional historical site", address1: "Fictional address", updatedAt: timestamp },
  Equipment: { id: "equipment", companyId: "company", siteId: "site", label: "Fictional historical equipment", serialNumber: "OLD-001", status: "IMPORTED_CUSTOM_STATUS", updatedAt: timestamp },
  ServiceTicket: { id: "ticket", companyId: "company", clientId: "client", siteId: "site", equipmentId: "equipment", number: "OLD-SAV-001", title: "Fictional historical ticket", description: "Preserved history", updatedAt: timestamp },
  FieldIntervention: { id: "visit", companyId: "company", siteId: "site", ticketId: "ticket", title: "Fictional historical intervention", scheduledStart: timestamp, updatedAt: timestamp },
}
for (const [table, data] of Object.entries(rows)) {
  const columns = Object.keys(data)
  db.prepare(`INSERT INTO "${table}" (${columns.map(column => `"${column}"`).join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`).run(...Object.values(data))
}
const snapshot = () => Object.fromEntries(Object.keys(rows).map(table => [table, db.prepare(`SELECT * FROM "${table}" ORDER BY "id"`).all()
  .map(row => Object.fromEntries(Object.entries(row).filter(([column]) => column !== "archivedAt")))]))
const before = snapshot()
assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), [])
db.close()
push(path.join(root, "prisma/schema.prisma"))
db = new DatabaseSync(databaseFile)
assert.deepEqual(snapshot(), before)
for (const table of ["CustomerSite", "Equipment"]) {
  assert.equal(db.prepare(`SELECT "archivedAt" FROM "${table}"`).get().archivedAt, null)
  const columns = db.prepare(`PRAGMA index_info("${table}_companyId_archivedAt_idx")`).all().map(row => row.name)
  assert.deepEqual(columns, ["companyId", "archivedAt"])
}
assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), [])
db.close()
const digest = value => createHash("sha256").update(value).digest("hex")
console.log(JSON.stringify({ success: true, engine: "SQLite", preservedTables: Object.keys(rows), preservedRows: Object.keys(rows).length,
  inactiveColumnsDefaultToNull: true, indexesVerified: 2, foreignKeyErrors: 0,
  previousSchemaSha256: digest(previous), schemaSha256: digest(schema), databaseFile }, null, 2))
