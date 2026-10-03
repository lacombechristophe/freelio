import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { PrismaClient } from "@prisma/client"
import { Queue } from "bullmq"
import { redisConnection } from "../src/lib/bullmq/connection.ts"

// This probe writes a queue job only against a newly created, fictitious recipe.
const database = new URL(process.env.DATABASE_URL || "")
if (process.env.RECIPE_ISOLATED !== "true" || !/^\/freelio_demo_linux_[a-f0-9]+$/.test(database.pathname)) throw Error("Recette Linux fictive explicite requise")
const prisma = new PrismaClient()
let queue
try {
  const [{ version }] = await prisma.$queryRaw`SELECT version()`
  assert.match(version, /PostgreSQL 18\./)
  const expectedMigrations = fs.readdirSync(path.resolve("prisma/postgresql/migrations"), { withFileTypes: true }).filter((entry) => entry.isDirectory() && fs.existsSync(path.resolve("prisma/postgresql/migrations", entry.name, "migration.sql"))).map((entry) => entry.name).sort()
  const applied = await prisma.$queryRaw`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name`
  assert.deepEqual(applied.map((entry) => entry.migration_name), expectedMigrations)
  const count = applied.length
  const quote = await prisma.quote.findFirst({ where: { company: { email: "direction@atelier-des-bassins.example.test" } } })
  assert.ok(quote, "Devis fictif requis")
  queue = new Queue("DOC_GEN", { connection: redisConnection("producer") })
  const job = await queue.add("linux-runtime-probe", { type: "QUOTE", id: quote.id }, { attempts: 1, removeOnComplete: false, removeOnFail: false })
  let result
  for (let attempt = 0; attempt < 90; attempt++) {
    const current = await queue.getJob(job.id)
    if (!current) throw Error("La preuve du job a été supprimée avant sa lecture")
    const state = await current.getState()
    if (state === "failed") throw Error("Échec du rendu PDF par le worker")
    if (state === "completed") { result = current.returnvalue; await current.remove(); break }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  assert.equal(result?.success, true, "Le worker doit terminer le rendu")
  assert.match(result.hash, /^[a-f0-9]{64}$/)
  assert.ok(result.pdfUrl)
  console.log(JSON.stringify({ schema: "freelio.runtime-database.v1", postgres: version.split(" on ")[0], appliedMigrations: count, quoteJob: "completed", pdfHash: result.hash, uid: process.getuid?.() }))
} finally {
  await queue?.close()
  await prisma.$disconnect()
}
