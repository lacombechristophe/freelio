import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { PrismaClient } from "@prisma/client"
import { decrypt } from "../src/lib/crypto.ts"

if (process.env.RECIPE_ISOLATED !== "true" || process.env.NODE_ENV === "production") throw Error("Une recette isolée hors production est obligatoire")
const sourceUrl = new URL(process.env.DATABASE_URL)
const targetUrl = new URL(process.env.RESTORE_DATABASE_URL)
for (const url of [sourceUrl, targetUrl]) {
  if (url.protocol !== "postgresql:" || !["127.0.0.1", "localhost"].includes(url.hostname)) throw Error("PostgreSQL local explicite requis")
}
if (!/^\/(freelio_recipe|freelio_demo_[a-z0-9_]+)$/.test(sourceUrl.pathname) || !/^\/freelio_restore_[a-z0-9_]+$/.test(targetUrl.pathname) || sourceUrl.href === targetUrl.href) throw Error("Bases de recette et de restauration distinctes requises")
const bin = process.env.POSTGRES_BIN || ""
const root = await fs.mkdtemp(path.join(os.tmpdir(), "Freelio-recovery-"))
const filesRoot = path.resolve(process.cwd(), "data", "files")
const restoredFilesRoot = path.join(root, "restored-files")
const backup = path.join(root, "database.dump")
const started = Date.now()
const source = new PrismaClient({ datasources: { db: { url: sourceUrl.href } } })
const target = new PrismaClient({ datasources: { db: { url: targetUrl.href } } })
function command(name, url, args) {
  const result = spawnSync(path.join(bin, process.platform === "win32" ? `${name}.exe` : name), ["-h", url.hostname, "-p", url.port || "5432", "-U", decodeURIComponent(url.username), ...args], {
    env: { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, PGPASSWORD: decodeURIComponent(url.password) }, encoding: "utf8", windowsHide: true, maxBuffer: 5 * 1024 * 1024,
  })
  if (result.error || result.status !== 0) throw Error(`${name} failed; no credentials are included in this diagnostic`)
}
async function snapshot(database) {
  const tables = await database.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
  const result = []
  for (const { tablename } of tables) {
    const quoted = `"${tablename.replaceAll('"', '""')}"`
    const [row] = await database.$queryRawUnsafe(`SELECT count(*)::int AS count, COALESCE(jsonb_agg(value ORDER BY value::text), '[]'::jsonb)::text AS data FROM (SELECT to_jsonb(t) AS value FROM ${quoted} t) rows`)
    result.push({ table: tablename, count: row.count, sha256: createHash("sha256").update(row.data).digest("hex") })
  }
  return result
}
async function files(directory, prefix = "") {
  let entries
  try { entries = await fs.readdir(directory, { withFileTypes: true }) } catch (error) { if (error.code === "ENOENT") return []; throw error }
  const result = []
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(directory, entry.name)
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isSymbolicLink()) throw Error("La recette refuse les liens symboliques")
    if (entry.isDirectory()) result.push(...await files(full, relative))
    else if (entry.isFile()) result.push({ path: relative, sha256: createHash("sha256").update(await fs.readFile(full)).digest("hex") })
  }
  return result
}
try {
  const before = await snapshot(source)
  const originalFiles = await files(filesRoot)
  command("pg_dump", sourceUrl, ["--format=custom", "--no-owner", "--no-acl", "--file", backup, "-d", sourceUrl.pathname.slice(1)])
  if (originalFiles.length) await fs.cp(filesRoot, restoredFilesRoot, { recursive: true, dereference: false })
  // This creates only a fresh, explicitly named recovery database. Never --clean or drop.
  command("createdb", targetUrl, [targetUrl.pathname.slice(1)])
  assert.deepEqual(await snapshot(target), [], "La cible doit être vierge")
  command("pg_restore", targetUrl, ["--exit-on-error", "--no-owner", "--no-acl", "-d", targetUrl.pathname.slice(1), backup])
  assert.deepEqual(await snapshot(source), before, "Des écritures concurrentes ont invalidé l’exercice")
  assert.deepEqual(await snapshot(target), before, "Les tables restaurées diffèrent")
  assert.deepEqual(await files(restoredFilesRoot), originalFiles, "Les fichiers restaurés diffèrent")
  const issued = await target.invoice.findMany({ where: { issuedDocument: { not: null } }, select: { issuedDocument: true, pdfUrl: true, pdfHash: true } })
  for (const invoice of issued) {
    const archive = JSON.parse(decrypt(invoice.issuedDocument))
    assert.equal(archive.version, 1)
    assert.equal(typeof archive.xml, "string")
    const relative = invoice.pdfUrl?.replace(/^local:/, "")
    if (!relative || path.isAbsolute(relative) || relative.split(/[\\/]/).includes("..")) throw Error("Archive de recette hors périmètre local")
    const file = await fs.readFile(path.join(restoredFilesRoot, relative))
    assert.equal(createHash("sha256").update(file).digest("hex"), invoice.pdfHash)
  }
  assert(issued.length > 0, "L’exercice doit restaurer une vraie archive émise et sa clé")
  const report = { schema: "freelio.postgres-recovery.v1", completedAt: new Date().toISOString(), elapsedMs: Date.now() - started, tablesVerified: before.length, rowsVerified: before.reduce((n, table) => n + table.count, 0), filesVerified: originalFiles.length, encryptedArchivesVerified: issued.length, tableDigests: before, backupSha256: createHash("sha256").update(await fs.readFile(backup)).digest("hex"), limitations: ["Recette locale avec données fictives et sans écritures concurrentes", "Le stockage distant et la récupération de secrets auprès du coffre de l’hébergeur restent à qualifier"] }
  await fs.writeFile(path.join(root, "verification.json"), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ ...report, tableDigests: undefined, evidenceDirectory: root }))
} finally { await Promise.all([source.$disconnect(), target.$disconnect()]) }
