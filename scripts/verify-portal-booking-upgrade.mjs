import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { DatabaseSync } from "node:sqlite"
import { fileURLToPath } from "node:url"

// Builds both schemas in a new external database. Existing application data,
// environment files, network services and generated clients are never used.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const directory = mkdtempSync(path.join(os.tmpdir(), "freelio-portal-booking-upgrade-"))
const databaseFile = path.join(directory, "historical.db")
const schema = readFileSync(path.join(root, "prisma/schema.prisma"), "utf8")
const fields = ["assignedMembershipId", "assignedMembership", "scheduledStart", "scheduledEnd", "confirmedAt"]
const pattern = /model ClientPortalAppointmentRequest \{[\s\S]*?^\}/m
const block = schema.match(pattern)?.[0]
assert.ok(block)
let oldBlock = block
for (const field of fields) oldBlock = oldBlock.replace(new RegExp(`^\\s*${field}\\s+[^\\r\\n]*\\r?\\n`, "m"), "\n")
oldBlock = oldBlock.replace(/^\s*@@index\(\[companyId, assignedMembershipId, status, scheduledStart\][^\r\n]*\r?\n/m, "\n")
assert.doesNotMatch(oldBlock, /assignedMembership|scheduledStart|scheduledEnd|confirmedAt/)
const previous = schema.replace(block, oldBlock).replace(/^\s*portalAppointments\s+ClientPortalAppointmentRequest\[\][^\r\n]*\r?\n/m, "\n")
const previousSchema = path.join(directory, "before.prisma")
writeFileSync(previousSchema, previous)
new DatabaseSync(databaseFile).close()
function push(schemaFile) {
  const result = spawnSync(process.execPath, [path.join(root, "node_modules/prisma/build/index.js"), "db", "push", "--skip-generate", "--schema", schemaFile], {
    cwd: root, windowsHide: true, encoding: "utf8", env: { ...process.env, DATABASE_URL: `file:${databaseFile.replaceAll("\\", "/")}` },
  })
  if (result.error) throw result.error
  assert.equal(result.status, 0, result.stderr || result.stdout)
}
push(previousSchema)
let db = new DatabaseSync(databaseFile)
const timestamp = Date.parse("2030-01-02T12:00:00.000Z")
db.prepare('INSERT INTO "Company" ("id", "name") VALUES (?, ?)').run("company", "Fictional booking upgrade")
db.prepare('INSERT INTO "Client" ("id", "companyId", "name", "updatedAt") VALUES (?, ?, ?, ?)').run("client", "company", "Fictional historical client", timestamp)
for (const status of ["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED"]) {
  db.prepare('INSERT INTO "ClientPortalAppointmentRequest" ("id", "companyId", "clientId", "subject", "preferredStart", "status", "response", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(status, "company", "client", "Fictional historical request", timestamp, status, "Historical response preserved", timestamp)
}
const columns = db.prepare('PRAGMA table_info("ClientPortalAppointmentRequest")').all().map(row => row.name)
const snapshot = () => db.prepare(`SELECT ${columns.map(name => `"${name}"`).join(", ")} FROM "ClientPortalAppointmentRequest" ORDER BY "id"`).all()
const before = snapshot()
db.close(); push(path.join(root, "prisma/schema.prisma")); db = new DatabaseSync(databaseFile)
assert.deepEqual(snapshot(), before)
for (const row of db.prepare('SELECT "assignedMembershipId", "scheduledStart", "scheduledEnd", "confirmedAt" FROM "ClientPortalAppointmentRequest"').all()) assert.ok(Object.values(row).every(value => value === null))
assert.deepEqual(db.prepare('PRAGMA index_info("PortalAppointment_member_status_start_idx")').all().map(row => row.name), ["companyId", "assignedMembershipId", "status", "scheduledStart"])
assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), [])
db.close()
const digest = value => createHash("sha256").update(value).digest("hex")
console.log(JSON.stringify({ success: true, engine: "SQLite", historicalRequestsPreserved: before.length, newFieldsDefaultToNull: true,
  noHistoricalReservationInvented: true, indexVerified: true, foreignKeyErrors: 0, previousSchemaSha256: digest(previous), schemaSha256: digest(schema), databaseFile }, null, 2))
