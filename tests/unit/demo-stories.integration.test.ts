import { execFileSync, spawnSync } from "node:child_process"
import { mkdtemp } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterAll, expect, it } from "vitest"
import { createDatabaseClient } from "@/lib/database-client"
import { demoStoryId } from "@/lib/demo-stories"

let database: ReturnType<typeof createDatabaseClient> | undefined
afterAll(async () => { await database?.$disconnect() })

it.skipIf(!process.env.DATABASE_URL?.startsWith("file:"))("adds three linked synthetic stories without sending, duplicating or resetting existing examples", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "Freelio-demo-stories-"))
  const url = `file:${path.join(directory, "demo.db").replaceAll("\\", "/")}`
  const env = { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, TEMP: directory, TMP: directory, NODE_ENV: "test" as const, DATABASE_URL: url, CHECKPOINT_DISABLE: "1", DEMO_PASSWORD: "FictionalStoryRecipe2026", DEMO_REFERENCE_DATE: "2026-10-25" }
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "db", "push", "--schema", "prisma/schema.prisma"], { env, stdio: "pipe", timeout: 30000 })
  const run = (...args: string[]) => JSON.parse(execFileSync(process.execPath, ["scripts/seed-demo.mjs", ...args], { env, encoding: "utf8", timeout: 30000 }))
  const initial = run()
  database = createDatabaseClient(url)
  expect(initial.stories.creates).toBeGreaterThan(30)
  const companyId: string = initial.companyId
  const projectId = demoStoryId(companyId, "chantier-project")
  const project = await database.project.findUniqueOrThrow({ where: { id: projectId }, include: { timeEntries: true, milestones: true, quotes: { include: { versions: true } }, invoices: true } })
  expect(project.milestones).toHaveLength(3)
  expect(project.timeEntries[0].durationSec).toBe(7200)
  expect(project.consumedCents).toBe(12500)
  expect(project.quotes[0].versions[0].totalTtcCents).toBe(project.invoices[0].totalTtcCents)
  const ticket = await database.serviceTicket.findUniqueOrThrow({ where: { id: demoStoryId(companyId, "sav-ticket") }, include: { equipment: true, interventions: true } })
  expect(ticket.equipment?.siteId).toBe(ticket.siteId)
  expect(ticket.interventions[0].siteId).toBe(ticket.siteId)
  expect(await database.leadCapture.findUniqueOrThrow({ where: { id: demoStoryId(companyId, "lead") } })).toMatchObject({ score: 65, marketingOptIn: false })
  expect(await database.communicationChannel.count()).toBe(0)
  expect(await database.emailDelivery.count()).toBe(0)
  expect(await database.invoice.count({ where: { status: { not: "DRAFT" } } })).toBe(0)
  expect(await database.automationWorkflow.findMany()).toEqual([expect.objectContaining({ status: "DRAFT", publishedVersion: null })])
  await database.project.update({ where: { id: projectId }, data: { description: "Modification fictive à conserver" } })
  const before = await database.project.findUniqueOrThrow({ where: { id: projectId } })
  const dryRun = run("--enrich")
  expect(dryRun).toMatchObject({ apply: false, creates: 0 })
  const repeated = run("--enrich", "--apply")
  expect(repeated).toMatchObject({ apply: true, creates: 0, preserved: initial.stories.creates })
  expect(await database.project.findUniqueOrThrow({ where: { id: projectId } })).toEqual(before)
  expect(await database.emailMessage.count()).toBe(3)
  expect(await database.emailMessage.findMany()).toEqual(expect.arrayContaining([expect.objectContaining({ fromAddress: expect.stringMatching(/@example\.test$/) })]))

  // An inconsistent existing relation must abort before adding missing examples.
  await database.notification.delete({ where: { id: demoStoryId(companyId, "notification") } })
  const other = await database.client.create({ data: { companyId, name: "Autre client fictif" } })
  await database.project.update({ where: { id: projectId }, data: { clientId: other.id } })
  const rejected = spawnSync(process.execPath, ["scripts/seed-demo.mjs", "--enrich", "--apply"], { env, encoding: "utf8", timeout: 30000 })
  expect(rejected.status).not.toBe(0)
  expect(rejected.stderr).toContain("Une relation d’un exemple existant a changé")
  expect(await database.notification.count()).toBe(0)
}, 90000)
