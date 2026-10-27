import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import { createDatabaseClient } from "../src/lib/database-client.ts"
import { demoStoryId } from "../src/lib/demo-stories.ts"

const execute = promisify(execFile)
const referenceDate = "2020-02-29"
const generatedClient = path.resolve("src/generated/prisma/client.ts")
const fingerprint = bytes => createHash("sha256").update(bytes).digest("hex")
const beforeClient = fingerprint(await readFile(generatedClient))
const checks = []

async function prepare(args = []) {
  let result
  try {
    result = await execute(process.execPath, ["scripts/demo.mjs", "--prepare", "--port", "54178", ...args], {
      cwd: process.cwd(), env: { ...process.env, DEMO_REFERENCE_DATE: referenceDate },
      timeout: 120_000, maxBuffer: 1024 * 1024, windowsHide: true,
    })
  } catch {
    // The launcher owns private credentials. Its captured output must not be
    // attached to an uncaught child-process error or published as an artifact.
    throw new Error("Isolated demo preparation failed")
  }
  const runtime = result.stdout.match(/^Dossier : (.+)$/m)?.[1]?.trim()
  assert(runtime && path.dirname(runtime) === path.join(os.tmpdir(), "Freelio-local-demo"), "Prepared demo must stay in its isolated temporary directory")
  return runtime
}

const runtime = await prepare()
checks.push("Demo prepared through its real entry point, without starting the application server")
const database = `file:${path.join(runtime, "demo.db").replaceAll("\\", "/")}`
let client = createDatabaseClient(database)
let changedClientId, companyId
try {
  const company = await client.company.findFirstOrThrow({ where: { email: "direction@atelier-des-bassins.example.test" } })
  companyId = company.id
  const task = await client.organisationTask.findUniqueOrThrow({ where: { id: demoStoryId(companyId, "vente-task") } })
  const invoice = await client.invoice.findFirstOrThrow({ where: { companyId, number: { startsWith: "DEMO-FACT-" } }, orderBy: { number: "asc" } })
  assert.equal(task.dueDate.toISOString(), "2020-03-02T12:00:00.000Z")
  assert.equal(invoice.date.toISOString(), "2020-02-29T12:00:00.000Z")
  assert(invoice.number.startsWith("DEMO-FACT-2020-"))
  assert.equal(await client.invoice.count({ where: { companyId, status: { not: "DRAFT" } } }), 0)
  checks.push("Base examples and linked stories share the explicit reference date; invoices remain drafts")
  const row = await client.client.findFirstOrThrow({ where: { companyId } })
  changedClientId = row.id
  await client.client.update({ where: { id: row.id }, data: { name: "Fictional edit preserved by setup recipe" } })
} finally { await client.$disconnect() }
assert.equal(await prepare(["--resume", runtime]), runtime)
client = createDatabaseClient(database)
try {
  assert.equal((await client.client.findUniqueOrThrow({ where: { id: changedClientId } })).name, "Fictional edit preserved by setup recipe")
  assert.equal(await client.company.count(), 1)
  assert.equal(await client.organisationTask.count({ where: { id: demoStoryId(companyId, "vente-task") } }), 1)
  checks.push("Resuming the prepared demo preserves edits and does not duplicate its workspace or story")
} finally { await client.$disconnect() }
assert.equal(fingerprint(await readFile(generatedClient)), beforeClient)
let invalidDateRefused = false
try {
  await execute(process.execPath, ["--import", "tsx", "scripts/seed-demo.mjs"], {
    cwd: process.cwd(), env: { ...process.env, NODE_ENV: "development", DATABASE_URL: database, DEMO_REFERENCE_DATE: "2020-02-30", DEMO_PASSWORD: "fictional-invalid-date-test" },
    timeout: 30_000, windowsHide: true,
  })
} catch (error) { invalidDateRefused = typeof error.stderr === "string" && error.stderr.includes("Date de référence invalide") }
assert(invalidDateRefused, "An impossible reference date must fail before seeding")
checks.push("An impossible reference date is refused before seeding")
checks.push("The source checkout's generated client remains unchanged")
await mkdir("test-results", { recursive: true })
await writeFile("test-results/demo-setup.json", JSON.stringify({ schema: "freelio.demo-setup.v1", success: true, referenceDate, checks, packagesInstalledByLauncher: false, applicationServerStarted: false, credentialsPublished: false }, null, 2) + "\n")
console.log(JSON.stringify({ success: true, checks }))
