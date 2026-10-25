import { randomUUID } from "node:crypto"
import { afterAll, afterEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
import prisma from "@/lib/prisma"
import { dispatchAutomationEvent, enqueueAutomationEvent, workflowConfigurationSchema } from "@/lib/automations/engine"
import { automationRunDetails, automationRunJournal } from "@/lib/automations/journal"

describe.sequential("persistent workflow waits and complete private action journals", () => {
  const companies: string[] = []
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
  afterAll(async () => {
    for (const id of companies) await prisma.company.delete({ where: { id } })
    await prisma.processorLease.deleteMany({ where: { name: { startsWith: "automation-event:" } } })
  })
  async function fixture(actions: object[]) {
    const company = await prisma.company.create({ data: { name: "Fictional wait recipe" } }); companies.push(company.id)
    const lead = await prisma.leadCapture.create({ data: { companyId: company.id, firstName: "Fiction", lastName: "Waiting", privacyAccepted: true, fingerprint: "fiction" } })
    const workflow = await prisma.automationWorkflow.create({ data: { companyId: company.id, name: "Fictional wait workflow", trigger: "LEAD_CREATED", status: "ACTIVE", publishedVersion: 1, actions,
      versions: { create: { companyId: company.id, version: 1, status: "PUBLISHED", publishedAt: new Date(), trigger: "LEAD_CREATED", actions } } } })
    const event = { companyId: company.id, event: "LEAD_CREATED" as const, subjectModel: "LeadCapture" as const, subjectId: lead.id, leadId: lead.id, eventKey: `${lead.id}:created` }
    return { company, lead, workflow, event }
  }
  async function admission(f: Awaited<ReturnType<typeof fixture>>) { return prisma.$transaction(tx => enqueueAutomationEvent(tx, f.event)) }
  async function due(id: string) { await prisma.automationEventOutbox.update({ where: { id }, data: { nextAttemptAt: new Date(0) } }) }
  function clock() { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2035-01-02T08:00:00Z")); vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No network allowed in the wait recipe") })) }

  it("validates bounded waits and supports waiting inside an immutable branch", () => {
    for (const delayHours of [0, -1, 0.5, 8761]) expect(() => workflowConfigurationSchema.parse({ actions: [{ type: "WAIT", delayHours }] })).toThrow()
    expect(workflowConfigurationSchema.parse({ actions: [{ type: "CONDITIONAL_BRANCH", label: "Fictional branch", conditions: {}, ifTrue: [{ type: "WAIT", delayHours: 8760 }], ifFalse: [] }] }).actions).toHaveLength(1)
  })
  it("persists two successive deadlines, resumes after reconnect, and never repeats a completed effect under two workers", async () => {
    clock()
    const f = await fixture([{ type: "CREATE_TASK", title: "Before wait", delayHours: 3 }, { type: "WAIT", delayHours: 1 }, { type: "CREATE_TASK", title: "After first wait" }, { type: "WAIT", delayHours: 2 }, { type: "CREATE_TASK", title: "After second wait" }]), id = await admission(f)
    await dispatchAutomationEvent(id)
    const first = await prisma.automationRun.findFirstOrThrow({ where: { companyId: f.company.id } })
    expect(first).toMatchObject({ status: "WAITING", nextActionPosition: 1, failures: 0, ownerId: null })
    expect(first.wakeAt).toEqual(new Date("2035-01-02T09:00:00Z"))
    expect(await prisma.organisationTask.count({ where: { companyId: f.company.id } })).toBe(1)
    const event = await prisma.automationEventOutbox.findUniqueOrThrow({ where: { id } })
    expect(event).toMatchObject({ attempts: 0, status: "PENDING", nextAttemptAt: first.wakeAt })
    expect((await prisma.organisationTask.findFirstOrThrow({ where: { companyId: f.company.id } })).dueDate).toEqual(new Date(event.createdAt.getTime() + 3 * 3_600_000))
    for (let pass = 0; pass < 6; pass++) { await due(id); await dispatchAutomationEvent(id) }
    expect((await prisma.automationRun.findUniqueOrThrow({ where: { id: first.id } })).attempts).toBe(1)
    expect((await prisma.automationRun.findUniqueOrThrow({ where: { id: first.id } })).wakeAt).toEqual(first.wakeAt)
    const detail = await automationRunDetails(f.company.id, first.id)
    expect(detail?.actions.map(action => action.status)).toEqual(["COMPLETED", "WAITING"])
    expect(detail?.actions[1].completedAt).toBeNull()
    vi.setSystemTime(first.wakeAt!)
    await Promise.all([dispatchAutomationEvent(id), dispatchAutomationEvent(id)])
    const second = await prisma.automationRun.findUniqueOrThrow({ where: { id: first.id } })
    expect(second).toMatchObject({ status: "WAITING", nextActionPosition: 3, failures: 0 })
    expect(second.wakeAt).toEqual(new Date("2035-01-02T11:00:00Z"))
    expect(await prisma.organisationTask.count({ where: { companyId: f.company.id } })).toBe(2)
    vi.setSystemTime(second.wakeAt!)
    expect((await dispatchAutomationEvent(id)).completed).toBe(1)
    await dispatchAutomationEvent(id)
    expect(await prisma.organisationTask.count({ where: { companyId: f.company.id } })).toBe(3)
    expect(await prisma.automationRun.findUniqueOrThrow({ where: { id: first.id } })).toMatchObject({ status: "COMPLETED", wakeAt: null, failures: 0, nextActionPosition: 5 })
    expect((await automationRunDetails(f.company.id, first.id))?.actions.every(action => action.status === "COMPLETED")).toBe(true)
  })
  it("keeps captured branch choices across a wait even if the live lead changes", async () => {
    clock()
    const f = await fixture([{ type: "CONDITIONAL_BRANCH", label: "Captured first branch", conditions: { leadStatus: "NEW" }, ifTrue: [{ type: "WAIT", delayHours: 1 }], ifFalse: [] },
      { type: "CONDITIONAL_BRANCH", label: "Captured second branch", conditions: { leadStatus: "QUALIFIED" }, ifTrue: [{ type: "WAIT", delayHours: 3 }], ifFalse: [{ type: "WAIT", delayHours: 2 }] }, { type: "CREATE_TASK", title: "After captured branches" }])
    const id = await admission(f)
    await dispatchAutomationEvent(id)
    await prisma.leadCapture.update({ where: { id: f.lead.id }, data: { status: "QUALIFIED" } })
    vi.setSystemTime(new Date("2035-01-02T09:00:00Z"))
    await dispatchAutomationEvent(id)
    const run = await prisma.automationRun.findFirstOrThrow({ where: { companyId: f.company.id } })
    expect(run.wakeAt).toEqual(new Date("2035-01-02T11:00:00Z"))
    expect(await prisma.organisationTask.count({ where: { companyId: f.company.id } })).toBe(0)
    vi.setSystemTime(run.wakeAt!)
    await dispatchAutomationEvent(id)
    expect(await prisma.organisationTask.count({ where: { companyId: f.company.id } })).toBe(1)
  })
  it("rolls back an effect whose checkpoint fails after a completed wait, then resumes without repeating prior effects", async () => {
    clock()
    const f = await fixture([{ type: "CREATE_TASK", title: "Committed before wait" }, { type: "WAIT", delayHours: 1 }, { type: "CREATE_TASK", title: "Atomic after wait" }]), id = await admission(f)
    await dispatchAutomationEvent(id)
    const run = await prisma.automationRun.findFirstOrThrow({ where: { companyId: f.company.id } })
    const name = `fictional_wait_fault_${randomUUID().replaceAll("-", "")}`, pg = process.env.DATABASE_URL?.startsWith("postgres")
    const condition = `NEW."runId" = '${run.id}' AND NEW."position" = 2 AND NEW."status" = 'COMPLETED'`
    if (pg) {
      await prisma.$executeRawUnsafe(`CREATE FUNCTION "${name}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF ${condition} THEN RAISE EXCEPTION 'fictional wait checkpoint fault'; END IF; RETURN NEW; END; $$`)
      await prisma.$executeRawUnsafe(`CREATE TRIGGER "${name}" BEFORE INSERT ON "AutomationRunAction" FOR EACH ROW EXECUTE FUNCTION "${name}"()`)
    } else await prisma.$executeRawUnsafe(`CREATE TRIGGER "${name}" BEFORE INSERT ON "AutomationRunAction" WHEN ${condition} BEGIN SELECT RAISE(ABORT, 'fictional wait checkpoint fault'); END`)
    try { vi.setSystemTime(run.wakeAt!); await dispatchAutomationEvent(id) } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER "${name}"${pg ? ' ON "AutomationRunAction"' : ""}`)
      if (pg) await prisma.$executeRawUnsafe(`DROP FUNCTION "${name}"()`)
    }
    expect(await prisma.organisationTask.count({ where: { companyId: f.company.id } })).toBe(1)
    expect(await prisma.automationRun.findUniqueOrThrow({ where: { id: run.id } })).toMatchObject({ status: "FAILED", nextActionPosition: 2, failures: 1 })
    expect((await automationRunDetails(f.company.id, run.id))?.actions.map(action => action.status)).toEqual(["COMPLETED", "COMPLETED", "FAILED"])
    await due(id); await dispatchAutomationEvent(id)
    expect(await prisma.organisationTask.count({ where: { companyId: f.company.id } })).toBe(2)
    expect((await automationRunDetails(f.company.id, run.id))?.actions.every(action => action.status === "COMPLETED")).toBe(true)
  })
  it("retains a deadline through pause/reactivation and marks an archived wait skipped without its next effect", async () => {
    clock()
    const f = await fixture([{ type: "WAIT", delayHours: 1 }, { type: "CREATE_TASK", title: "After reactivation" }]), id = await admission(f)
    await dispatchAutomationEvent(id)
    const run = await prisma.automationRun.findFirstOrThrow({ where: { companyId: f.company.id } })
    await prisma.automationWorkflow.update({ where: { id: f.workflow.id }, data: { status: "PAUSED" } })
    await due(id); await dispatchAutomationEvent(id)
    expect(await prisma.automationRun.findUniqueOrThrow({ where: { id: run.id } })).toMatchObject({ status: "PAUSED", wakeAt: run.wakeAt })
    vi.setSystemTime(new Date(run.wakeAt!.getTime() + 1000))
    await due(id); await dispatchAutomationEvent(id)
    expect(await prisma.organisationTask.count({ where: { companyId: f.company.id } })).toBe(0)
    await prisma.automationWorkflow.update({ where: { id: f.workflow.id }, data: { status: "ACTIVE" } })
    await due(id); await dispatchAutomationEvent(id)
    expect(await prisma.organisationTask.count({ where: { companyId: f.company.id } })).toBe(1)
    const other = await fixture([{ type: "WAIT", delayHours: 2 }, { type: "CREATE_TASK", title: "Must not execute" }]), otherId = await admission(other)
    await dispatchAutomationEvent(otherId)
    await prisma.automationWorkflow.update({ where: { id: other.workflow.id }, data: { status: "ARCHIVED" } })
    await due(otherId); await dispatchAutomationEvent(otherId)
    const stopped = await prisma.automationRun.findFirstOrThrow({ where: { companyId: other.company.id } })
    expect(stopped).toMatchObject({ status: "SKIPPED", wakeAt: null })
    expect((await automationRunDetails(other.company.id, stopped.id))?.actions[0].status).toBe("SKIPPED")
    expect(await prisma.organisationTask.count({ where: { companyId: other.company.id } })).toBe(0)
  })
  it("does not abandon a waiting sibling when another run exhausts its five actual errors", async () => {
    clock()
    const f = await fixture([{ type: "ENROLL_SEQUENCE", sequenceId: `c${randomUUID().replaceAll("-", "")}` }])
    await prisma.automationWorkflow.create({ data: { companyId: f.company.id, name: "Fictional waiting sibling", trigger: "LEAD_CREATED", status: "ACTIVE", publishedVersion: 1,
      actions: [{ type: "WAIT", delayHours: 8760 }, { type: "CREATE_TASK", title: "Sibling completes" }], versions: { create: { companyId: f.company.id, version: 1, status: "PUBLISHED", publishedAt: new Date(), trigger: "LEAD_CREATED", actions: [{ type: "WAIT", delayHours: 8760 }, { type: "CREATE_TASK", title: "Sibling completes" }] } } } })
    const id = await admission(f)
    for (let attempt = 0; attempt < 5; attempt++) { await due(id); await dispatchAutomationEvent(id) }
    const runs = await prisma.automationRun.findMany({ where: { companyId: f.company.id } })
    expect(runs.find(run => run.workflowId === f.workflow.id)).toMatchObject({ status: "DEAD_LETTER", failures: 5 })
    const waiting = runs.find(run => run.status === "WAITING")!
    expect(waiting).toMatchObject({ failures: 0, attempts: 1 })
    expect(await prisma.automationEventOutbox.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "PENDING", nextAttemptAt: waiting.wakeAt })
    vi.setSystemTime(waiting.wakeAt!)
    await dispatchAutomationEvent(id)
    expect(await prisma.organisationTask.count({ where: { companyId: f.company.id } })).toBe(1)
    expect((await prisma.automationEventOutbox.findUniqueOrThrow({ where: { id } })).status).toBe("DEAD_LETTER")
    expect((await prisma.automationRun.findUniqueOrThrow({ where: { id: waiting.id } })).status).toBe("COMPLETED")
  })
  it("paginates all 101 executions, exposes only safe checkpoints, and refuses foreign details and public writes", async () => {
    const f = await fixture([{ type: "WAIT", delayHours: 1 }]), other = await fixture([{ type: "WAIT", delayHours: 1 }])
    const rows = Array.from({ length: 101 }, (_, index) => ({ companyId: f.company.id, workflowId: f.workflow.id, event: index === 100 ? "FICTIONAL_LAST" : "LEAD_CREATED", eventKey: `fictional:${index}`, subjectId: f.lead.id, subjectModel: "LeadCapture", status: "COMPLETED", input: { secret: "FICTIONAL_SECRET_NOT_FOR_UI" } }))
    await prisma.automationRun.createMany({ data: rows })
    expect(await automationRunJournal(f.company.id, { page: 5 })).toMatchObject({ total: 101, page: 5, pageCount: 5 })
    const last = await automationRunJournal(f.company.id, { search: "FICTIONAL_LAST", status: "COMPLETED" })
    expect(last.rows).toHaveLength(1)
    const id = last.rows[0].id
    expect((await automationRunDetails(f.company.id, id))?.historicalUnavailable).toBe(true)
    await prisma.automationRunAction.create({ data: { runId: id, position: 0, output: { type: "CREATE_TASK", secret: "FICTIONAL_SECRET_NOT_FOR_UI" } } })
    expect(JSON.stringify(await automationRunDetails(f.company.id, id))).not.toContain("FICTIONAL_SECRET_NOT_FOR_UI")
    expect(JSON.stringify(last)).not.toContain("FICTIONAL_SECRET_NOT_FOR_UI")
    expect(await automationRunDetails(other.company.id, id)).toBeNull()
    expect((await automationRunJournal(other.company.id)).total).toBe(0)
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    await expect(admission(f)).rejects.toThrow("lecture seule")
    expect(await prisma.automationEventOutbox.count({ where: { companyId: f.company.id } })).toBe(0)
  })
})
