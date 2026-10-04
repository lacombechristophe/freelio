import { afterAll, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import prisma from "@/lib/prisma"
import { dispatchAutomationEvent, enqueueAutomationEvent } from "@/lib/automations/engine"

describe.sequential("durable workflow execution", () => {
  const companies: string[] = []
  afterAll(async () => {
    for (const companyId of companies) await prisma.company.delete({ where: { id: companyId } })
    await prisma.processorLease.deleteMany({ where: { name: { startsWith: "automation-event:" } } })
  })

  async function fixture(actions: object[], conditions: object = {}) {
    const company = await prisma.company.create({ data: { name: "Fictitious durable automation" } })
    companies.push(company.id)
    const lead = await prisma.leadCapture.create({ data: { companyId: company.id, firstName: "Fiction", lastName: "Workflow", email: "workflow@example.test", marketingOptIn: true, privacyAccepted: true, fingerprint: "fixture" } })
    const workflow = await prisma.automationWorkflow.create({ data: { companyId: company.id, name: "Immutable fixture", trigger: "LEAD_CREATED", status: "ACTIVE", publishedVersion: 1, conditions, actions,
      versions: { create: { companyId: company.id, version: 1, status: "PUBLISHED", publishedAt: new Date(), trigger: "LEAD_CREATED", conditions, actions } },
    } })
    const event = { companyId: company.id, event: "LEAD_CREATED" as const, subjectModel: "LeadCapture" as const, subjectId: lead.id, leadId: lead.id, eventKey: `${lead.id}:created` }
    return { company, lead, workflow, event }
  }

  it("rolls back the source change and its event together", async () => {
    const { lead, event, company } = await fixture([{ type: "CREATE_TASK", title: "Fixture task" }])
    await expect(prisma.$transaction(async (tx) => {
      await tx.leadCapture.update({ where: { id: lead.id }, data: { status: "QUALIFIED" } })
      await enqueueAutomationEvent(tx, event)
      throw new Error("Injected rollback")
    })).rejects.toThrow("Injected rollback")
    expect((await prisma.leadCapture.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe("NEW")
    expect(await prisma.automationEventOutbox.count({ where: { companyId: company.id } })).toBe(0)
    expect(await prisma.automationRun.count({ where: { companyId: company.id } })).toBe(0)
  })

  it("uses the published configuration and captured input after either changes", async () => {
    const { company, lead, workflow, event } = await fixture([{ type: "CREATE_TASK", title: "Published {{contact.firstName}}" }], { leadStatus: "NEW" })
    const id = await prisma.$transaction((tx) => enqueueAutomationEvent(tx, event))
    await prisma.automationWorkflow.update({ where: { id: workflow.id }, data: { actions: [{ type: "CREATE_TASK", title: "Changed draft" }] } })
    await prisma.leadCapture.update({ where: { id: lead.id }, data: { status: "QUALIFIED", firstName: "Changed" } })
    const result = await dispatchAutomationEvent(id)
    expect(result.completed).toBe(1)
    const tasks = await prisma.organisationTask.findMany({ where: { companyId: company.id } })
    expect(tasks).toHaveLength(1)
    expect(tasks[0].title).toBe("Published Fiction")
    expect((await prisma.automationRun.findFirstOrThrow({ where: { companyId: company.id } })).workflowVersion).toBe(1)
  })

  it("resumes after an action failure without duplicating the committed task", async () => {
    const { company, lead, workflow, event } = await fixture([{ type: "CREATE_TASK", title: "Task once" }])
    const sequence = await prisma.emailSequence.create({ data: { companyId: company.id, name: "Paused fixture", status: "PAUSED", steps: { create: { position: 0, type: "MANUAL_TASK", subject: "Fixture", bodyHtml: "Fixture" } } } })
    const actions = [{ type: "CREATE_TASK", title: "Task once" }, { type: "ENROLL_SEQUENCE", sequenceId: sequence.id }]
    await prisma.automationWorkflowVersion.update({ where: { workflowId_version: { workflowId: workflow.id, version: 1 } }, data: { actions } })
    const id = await prisma.$transaction((tx) => enqueueAutomationEvent(tx, event))
    expect((await dispatchAutomationEvent(id)).completed).toBe(0)
    const failed = await prisma.automationRun.findFirstOrThrow({ where: { companyId: company.id } })
    expect(failed.status).toBe("FAILED")
    expect(failed.nextActionPosition).toBe(1)
    expect(await prisma.organisationTask.count({ where: { companyId: company.id } })).toBe(1)
    await prisma.emailSequence.update({ where: { id: sequence.id }, data: { status: "ACTIVE" } })
    await prisma.automationEventOutbox.update({ where: { id }, data: { nextAttemptAt: new Date(0) } })
    expect((await dispatchAutomationEvent(id)).completed).toBe(1)
    await dispatchAutomationEvent(id)
    expect(await prisma.organisationTask.count({ where: { companyId: company.id } })).toBe(1)
    expect(await prisma.emailSequenceEnrollment.count({ where: { sequenceId: sequence.id, leadCaptureId: lead.id } })).toBe(1)
    expect(await prisma.automationRunAction.count({ where: { runId: failed.id } })).toBe(2)
  })

  it("concurrent dispatch and duplicate admission keep one event and one effect", async () => {
    const { company, event } = await fixture([{ type: "CREATE_TASK", title: "Concurrent fixture" }])
    const id = await prisma.$transaction((tx) => enqueueAutomationEvent(tx, event))
    expect(await prisma.$transaction((tx) => enqueueAutomationEvent(tx, event))).toBe(id)
    await Promise.all([dispatchAutomationEvent(id), dispatchAutomationEvent(id)])
    expect(await prisma.organisationTask.count({ where: { companyId: company.id } })).toBe(1)
    expect(await prisma.automationEventOutbox.count({ where: { companyId: company.id } })).toBe(1)
    expect((await prisma.automationEventOutbox.findUniqueOrThrow({ where: { id } })).status).toBe("COMPLETED")
  })
})
