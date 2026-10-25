import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { DatabaseSync } from "node:sqlite"
import { fileURLToPath } from "node:url"

// This check creates its own external database and ignores application credentials.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const directory = mkdtempSync(path.join(os.tmpdir(), "freelio-purchase-inspection-upgrade-"))
const databaseFile = path.join(directory, "historical.db")
const schema = readFileSync(path.join(root, "prisma/schema.prisma"), "utf8")
const previous = schema.replace(/^.*resolutionKind.*\r?\n/gm, "")
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
db.exec(run(["migrate", "diff", "--from-empty", "--to-schema", beforeSchema, "--script"]))
const at = Date.parse("2035-01-02T12:00:00Z")
db.prepare('INSERT INTO "Company" ("id", "name") VALUES (?, ?)').run("company", "Fictional inspection upgrade")
db.prepare('INSERT INTO "Supplier" ("id", "companyId", "name", "updatedAt") VALUES (?, ?, ?, ?)').run("supplier", "company", "Fictional supplier", at)
db.prepare('INSERT INTO "Product" ("id", "companyId", "sku", "label", "updatedAt") VALUES (?, ?, ?, ?, ?)').run("product", "company", "FICTION", "Fictional product", at)
db.prepare('INSERT INTO "Warehouse" ("id", "companyId", "code", "name", "updatedAt") VALUES (?, ?, ?, ?, ?)').run("warehouse", "company", "FICTION", "Fictional warehouse", at)
db.prepare('INSERT INTO "PurchaseOrder" ("id", "companyId", "supplierId", "number", "status", "updatedAt") VALUES (?, ?, ?, ?, ?, ?)').run("order", "company", "supplier", "FICTION", "RECEIVED", at)
db.prepare('INSERT INTO "PurchaseOrderLine" ("id", "purchaseOrderId", "productId", "label", "quantity", "receivedQuantity", "unitPriceCents") VALUES (?, ?, ?, ?, ?, ?, ?)').run("line", "order", "product", "Fictional line", 3, 3, 100)
db.prepare('INSERT INTO "GoodsReceipt" ("id", "companyId", "purchaseOrderId", "warehouseId", "number") VALUES (?, ?, ?, ?, ?)').run("receipt", "company", "order", "warehouse", "FICTION")
db.prepare('INSERT INTO "GoodsReceiptLine" ("id", "goodsReceiptId", "purchaseOrderLineId", "productId", "quantity", "acceptedQuantity", "rejectedQuantity") VALUES (?, ?, ?, ?, ?, ?, ?)').run("receipt-line", "receipt", "line", "product", 3, 1, 2)
db.prepare('INSERT INTO "InventoryItem" ("id", "companyId", "warehouseId", "productId", "quantity", "updatedAt") VALUES (?, ?, ?, ?, ?, ?)').run("inventory", "company", "warehouse", "product", 3, at)
for (const [id, status, resolution] of [["closed", "RESOLVED", "Historical free-text decision"], ["open", "OPEN", null]]) {
  db.prepare('INSERT INTO "PurchaseIssue" ("id", "companyId", "purchaseOrderId", "purchaseOrderLineId", "goodsReceiptLineId", "productId", "type", "quantity", "status", "resolution", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, "company", "order", "line", "receipt-line", "product", "QUALITY", 2, status, resolution, at)
}
const tables = ["Company", "Supplier", "Product", "Warehouse", "PurchaseOrder", "PurchaseOrderLine", "GoodsReceipt", "GoodsReceiptLine", "InventoryItem", "PurchaseIssue"]
const snapshot = () => Object.fromEntries(tables.map(table => [table, db.prepare(`SELECT * FROM "${table}" ORDER BY "id"`).all().map(row => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "resolutionKind")))]))
const before = snapshot()
const sqliteDiff = run(["migrate", "diff", "--from-schema", beforeSchema, "--to-schema", path.join(root, "prisma/schema.prisma"), "--script"])
assert.doesNotMatch(sqliteDiff, /\b(DROP|DELETE|UPDATE|RENAME)\b/i)
db.exec(sqliteDiff)
assert.deepEqual(snapshot(), before)
assert.equal(db.prepare('SELECT COUNT(*) AS "count" FROM "PurchaseIssue" WHERE "resolutionKind" IS NOT NULL').get().count, 0)
assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), [])
db.close()
const postgresBefore = path.join(directory, "before-postgres.prisma"), postgresAfter = path.join(directory, "after-postgres.prisma")
writeFileSync(postgresBefore, previous.replace('provider = "sqlite"', 'provider = "postgresql"'))
writeFileSync(postgresAfter, schema.replace('provider = "sqlite"', 'provider = "postgresql"'))
const postgresDiff = run(["migrate", "diff", "--from-schema", postgresBefore, "--to-schema", postgresAfter, "--script"])
const normalize = value => value.replace(/^--.*$/gm, "").replace(/\s+/g, " ").trim()
assert.equal(normalize(postgresDiff), normalize(readFileSync(path.join(root, "prisma/postgresql/migrations/20261021020000_purchase_issue_resolution_kind/migration.sql"), "utf8")))
const hash = value => createHash("sha256").update(value).digest("hex")
console.log(JSON.stringify({ success: true, engine: "SQLite", preservedRows: 11, preservedTables: tables, historicalDecisionsUnclassified: true,
  originalReceiptAndStockPreserved: true, foreignKeyErrors: 0, postgresDiffMatchesMigration: true, postgresMigrationExecuted: false,
  previousSchemaSha256: hash(previous), schemaSha256: hash(schema), databaseFile }, null, 2))
