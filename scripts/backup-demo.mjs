import fs from "node:fs/promises"
import { createReadStream } from "node:fs"
import { createHash, randomUUID } from "node:crypto"
import path from "node:path"
import os from "node:os"
import { PrismaClient } from "@prisma/client"
import { acquireDemoLock } from "./demo-lock.mjs"

const args = process.argv.slice(2)
const restore = args[0] === "--restore"
const location = args[1] && await fs.realpath(args[1])
if ((!restore && args[0] !== "--dir") || !location) throw new Error("Usage : node scripts/backup-demo.mjs --dir DOSSIER_DEMO | --restore DOSSIER_SAUVEGARDE")

async function hashFile(file) {
  const hash = createHash("sha256")
  for await (const chunk of createReadStream(file)) hash.update(chunk)
  return hash.digest("hex")
}
function inside(root, relative) {
  const resolved = path.resolve(root, relative)
  if (!resolved.startsWith(root + path.sep) || path.relative(root, resolved).replaceAll("\\", "/") !== relative) throw new Error("Chemin hors sauvegarde")
  return resolved
}
async function checkedFile(root, relative) {
  const resolved = inside(root, relative)
  if (await fs.realpath(resolved) !== resolved || !(await fs.lstat(resolved)).isFile()) throw new Error("Lien symbolique ou fichier hors sauvegarde")
  return resolved
}
async function collect(root, relative = "data") {
  const directory = inside(root, relative)
  if (!(await fs.stat(directory).catch(() => null))) return []
  const files = []
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const name = path.posix.join(relative, entry.name)
    if (entry.isSymbolicLink()) throw new Error("Lien symbolique interdit dans les fichiers de démo")
    if (entry.isDirectory()) files.push(...await collect(root, name))
    else if (entry.isFile()) files.push(name)
  }
  return files
}
async function checkDatabase(database) {
  const client = new PrismaClient({ datasources: { db: { url: `file:${database.replaceAll("\\", "/")}` } } })
  try {
    const result = await client.$queryRawUnsafe("PRAGMA integrity_check")
    if (result.length !== 1 || Object.values(result[0])[0] !== "ok") throw new Error("Intégrité SQLite invalide")
    return { companies: await client.company.count(), users: await client.user.count(), clients: await client.client.count(), invoices: await client.invoice.count() }
  } finally { await client.$disconnect() }
}

if (restore) {
  const manifest = JSON.parse(await fs.readFile(path.join(location, "manifest.json"), "utf8"))
  if (manifest.schema !== "freelio.demo-backup.v1" || !Array.isArray(manifest.files)) throw new Error("Manifeste de démo invalide")
  const allowed = new Set()
  for (const file of manifest.files) {
    if (typeof file.path !== "string" || !/^(demo\.db|demo-access\.json|data\/.+)$/.test(file.path) || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error("Entrée de sauvegarde invalide")
    if (allowed.has(file.path)) throw new Error("Entrée de sauvegarde répétée")
    allowed.add(file.path)
    const original = await checkedFile(location, file.path)
    if (await hashFile(original) !== file.sha256) throw new Error("Empreinte de sauvegarde invalide")
  }
  if (!allowed.has("demo.db") || !allowed.has("demo-access.json")) throw new Error("Sauvegarde incomplète")
  const parent = path.join(os.tmpdir(), "Freelio-local-demo")
  await fs.mkdir(parent, { recursive: true })
  const target = await fs.mkdtemp(path.join(parent, "restore-"))
  for (const file of manifest.files) {
    const output = inside(target, file.path)
    await fs.mkdir(path.dirname(output), { recursive: true })
    await fs.copyFile(await checkedFile(location, file.path), output)
  }
  const counts = await checkDatabase(path.join(target, "demo.db"))
  console.log(JSON.stringify({ restoredDirectory: target, files: manifest.files.length, counts, sourceUnchanged: true }))
} else {
  const access = JSON.parse(await fs.readFile(path.join(location, "demo-access.json"), "utf8"))
  if (access.schema !== "freelio.local-demo.v1") throw new Error("Ce dossier n’est pas une démo locale")
  const releaseOperation = await acquireDemoLock(location, "BACKUP")
  const client = new PrismaClient({ datasources: { db: { url: `file:${path.join(location, "demo.db").replaceAll("\\", "/")}` } } })
  try {
    await fs.access(path.join(location, "demo.db"))
    const target = path.join(location, "backups", `demo-${new Date().toISOString().replaceAll(":", "-")}-${randomUUID()}`)
    await fs.mkdir(target, { recursive: true })
    const database = path.join(target, "demo.db")
    // VACUUM INTO produces a consistent native snapshot, including WAL contents.
    await client.$executeRawUnsafe(`VACUUM INTO '${database.replaceAll("'", "''")}'`)
    const names = ["demo.db", "demo-access.json", ...await collect(location)]
    for (const name of names.slice(1)) {
      const output = inside(target, name)
      await fs.mkdir(path.dirname(output), { recursive: true })
      await fs.copyFile(await checkedFile(location, name), output)
    }
    const files = []
    for (const name of names) files.push({ path: name, sha256: await hashFile(inside(target, name)) })
    const counts = await checkDatabase(database)
    await fs.writeFile(path.join(target, "manifest.json"), JSON.stringify({ schema: "freelio.demo-backup.v1", createdAt: new Date().toISOString(), files, counts }, null, 2), { flag: "wx" })
    console.log(JSON.stringify({ backupDirectory: target, files: files.length, counts }))
  } finally {
    await client.$disconnect()
    await releaseOperation()
  }
}
