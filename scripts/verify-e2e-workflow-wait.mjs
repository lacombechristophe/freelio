// SQL-only fictional CI exercise. No server, transport, or provider is started.
if (process.env.RECIPE_ISOLATED !== "true" || process.env.DATABASE_URL !== "file:./e2e-ci.db") throw new Error("An isolated E2E database is required")
const [name, operation] = process.argv.slice(2)
if (!/^UIQA Wait (desktop|mobile)$/.test(name || "") || !["START", "FINISH"].includes(operation)) throw new Error("A declared fictional workflow and operation are required")
const { default: prisma } = await import("../src/lib/prisma.ts")
const { enqueueAutomationEvent, dispatchAutomationEvent } = await import("../src/lib/automations/engine.ts")
const ActualDate = Date
try {
  const workflow = await prisma.automationWorkflow.findUniqueOrThrow({ where: { companyId_name: { companyId: "e2e-company", name } } })
  if (workflow.status !== "ACTIVE") throw new Error("The fictional workflow must be published")
  const eventKey = `fictional-wait:${workflow.id}`
  let eventId
  if (operation === "START") {
    const lead = await prisma.leadCapture.create({ data: { companyId: workflow.companyId, firstName: "Fiction", lastName: "Waiting recipe", privacyAccepted: true, fingerprint: eventKey, source: "ISOLATED_WAIT_E2E" } })
    eventId = await prisma.$transaction(tx => enqueueAutomationEvent(tx, { companyId: workflow.companyId, event: "LEAD_CREATED", subjectModel: "LeadCapture", subjectId: lead.id, leadId: lead.id, eventKey }))
  } else {
    const run = await prisma.automationRun.findUniqueOrThrow({ where: { workflowId_eventKey: { workflowId: workflow.id, eventKey } } })
    if (run.status !== "WAITING" || !run.wakeAt) throw new Error("A persisted fictional wait is required")
    const timestamp = run.wakeAt.getTime() + 1
    // Only this short-lived CI child observes the advanced clock. The database
    // deadline and all engine checks stay intact; no real hour is waited.
    globalThis.Date = class extends ActualDate { constructor(...args) { super(...(args.length ? args : [timestamp])) } static now() { return timestamp } }
    eventId = (await prisma.automationEventOutbox.findUniqueOrThrow({ where: { companyId_eventKey: { companyId: workflow.companyId, eventKey } } })).id
  }
  await dispatchAutomationEvent(eventId)
  const run = await prisma.automationRun.findUniqueOrThrow({ where: { workflowId_eventKey: { workflowId: workflow.id, eventKey } } })
  if (run.status !== (operation === "START" ? "WAITING" : "COMPLETED")) throw new Error("The fictional workflow did not reach the expected state")
  process.stdout.write(JSON.stringify({ state: run.status, failures: run.failures }))
} finally { globalThis.Date = ActualDate; await prisma.$disconnect() }
