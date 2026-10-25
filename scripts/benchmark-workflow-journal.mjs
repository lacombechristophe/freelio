// Repeatable SQL-only volume recipe; never point this script at application data.
import assert from "node:assert/strict"
import { randomUUID, createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { cpus, platform, arch } from "node:os"
import { performance } from "node:perf_hooks"
if (process.env.RECIPE_ISOLATED !== "true" || process.env.DATABASE_URL !== "file:./functional.db") throw new Error("An isolated fictional functional database is required")
const { default: prisma } = await import("../src/lib/prisma.ts")
const { automationRunJournal, automationRunDetails } = await import("../src/lib/automations/journal.ts")
const source = process.env.RECIPE_SOURCE_COMMIT
if (!/^[a-f0-9]{40}$/.test(source || "")) throw new Error("The source commit must be supplied by the recipe caller")
const scriptSha256 = createHash("sha256").update(await readFile(new URL(import.meta.url))).digest("hex")
const report = { scriptSha256, schema: "freelio.workflow-journal-volume.v1", source, startedAt: new Date().toISOString(), runtime: { node: process.version, os: platform(), architecture: arch(), cpu: cpus()[0]?.model, cpuCount: cpus().length }, rows: 10_000, pageSize: 25, measurements: {}, checks: [], exclusions: ["Hosted latency or capacity guarantee", "Concurrent production load", "Provider delivery", "SIGKILL injection", "Browser performance"] }
let companyId
try {
  report.runtime.sqlite = (await prisma.$queryRawUnsafe("SELECT sqlite_version() AS version"))[0].version
  const company = await prisma.company.create({ data: { name: `FICTIONAL_JOURNAL_VOLUME_${randomUUID()}` } }); companyId = company.id
  const workflow = await prisma.automationWorkflow.create({ data: { companyId, name: "Fictional journal volume", trigger: "LEAD_CREATED", status: "ARCHIVED", actions: [{ type: "NOTIFY_TEAM", title: "Never dispatched in this recipe" }] } })
  const seedStart = performance.now()
  for (let batch = 0; batch < 20; batch++) {
    await prisma.automationRun.createMany({ data: Array.from({ length: 500 }, (_, offset) => {
      const index = batch * 500 + offset
      return { companyId, workflowId: workflow.id, event: index === 9_999 ? "FICTIONAL_BENCH_LAST" : "LEAD_CREATED", eventKey: `fictional-volume:${index}`, subjectModel: "LeadCapture", subjectId: "fictional-no-effect", status: index % 10 === 0 ? "FAILED" : "COMPLETED", startedAt: new Date(Date.UTC(2000, 0, 1) + index * 1000) }
    }) })
  }
  report.measurements.seedMs = +(performance.now() - seedStart).toFixed(2)
  async function measure(label, action) {
    const durations = []
    let result
    for (let sample = 0; sample < 6; sample++) { const start = performance.now(); result = await action(); durations.push(+(performance.now() - start).toFixed(2)) }
    report.measurements[label] = { coldMs: durations[0], warmMs: durations.slice(1), warmMedianMs: [...durations.slice(1)].sort((a,b) => a-b)[2] }
    return result
  }
  const first = await measure("firstPage", () => automationRunJournal(companyId, {}))
  assert.equal(first.total, 10_000); assert.equal(first.rows.length, 25)
  const last = await measure("lastPage", () => automationRunJournal(companyId, { page: 400 }))
  assert.equal(last.pageCount, 400); assert.equal(last.page, 400); assert.equal(last.rows.length, 25)
  assert.equal(await prisma.automationRun.findFirst({ where: { companyId, id: last.rows.at(-1).id }, select: { eventKey: true } }).then(row => row.eventKey), "fictional-volume:0")
  report.checks.push("All 10,000 executions counted; oldest row accessible on page 400")
  const search = await measure("lastRowSearch", () => automationRunJournal(companyId, { search: "FICTIONAL_BENCH_LAST", status: "COMPLETED" }))
  assert.equal(search.total, 1); assert.equal(search.rows.length, 1)
  const failed = await measure("failedFilter", () => automationRunJournal(companyId, { status: "FAILED", page: 40 }))
  assert.equal(failed.total, 1000); assert.equal(failed.pageCount, 40); assert.equal(failed.rows.length, 25)
  report.checks.push("Search plus state and last filtered page preserve exact totals")
  const runId = search.rows[0].id
  await prisma.automationRunAction.create({ data: { runId, position: 0, output: { type: "NOTIFY_TEAM", secret: "FICTIONAL_NOT_FOR_DTO" } } })
  const details = await measure("details", () => automationRunDetails(companyId, runId))
  assert.equal(details.actions.length, 1); assert.ok(!JSON.stringify(details).includes("FICTIONAL_NOT_FOR_DTO"))
  assert.equal(await automationRunDetails("fictional-foreign-company", runId), null)
  report.checks.push("Detail DTO excludes raw output; foreign company cannot read it")
  report.measurements.rssMiBAtEnd = +(process.memoryUsage().rss / 1024 / 1024).toFixed(2)
} finally {
  if (companyId) {
    await prisma.company.delete({ where: { id: companyId } })
    assert.equal(await prisma.automationRun.count({ where: { companyId } }), 0)
    report.checks.push("Fictional company and its 10,000 executions removed by cascade")
  }
  await prisma.$disconnect()
}
report.finishedAt = new Date().toISOString()
process.stdout.write(JSON.stringify(report, null, 2) + "\n")
