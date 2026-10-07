import { randomUUID } from "node:crypto"
import { Prisma } from "@prisma/client"
import { z } from "zod"

import { automationTriggerSchema, evaluateWorkflowConfiguration, renderWorkflowTitle, type AutomationEvent } from "@/lib/automations/engine"
import { enrollLeadInSequenceInternal } from "@/lib/automations/sequences"
import { requestContext } from "@/lib/context"
import prisma, { type TransactionClient } from "@/lib/prisma"
import { withProcessorLease, type ProcessorLeaseControl } from "@/lib/processing/lease"
import { assertDemoMutationAllowed } from "@/lib/demo-policy"

const eventSchema = z.object({
  companyId: z.string(), event: automationTriggerSchema, subjectModel: z.enum(["LeadCapture", "Quote", "EmailMessage", "ClientPortalAppointmentRequest", "FieldIntervention", "Client"]),
  subjectId: z.string(), eventKey: z.string().min(1).max(500), leadId: z.string().optional(), clientId: z.string().optional(),
  context: z.object({ clientName: z.string().optional(), healthStatus: z.enum(["HEALTHY", "WATCH", "RISK"]).optional(), healthScore: z.number().optional(), previousHealthScore: z.number().nullable().optional() }).optional(),
})
const snapshotSchema = z.object({
  event: eventSchema,
  company: z.object({ id: z.string(), name: z.string(), email: z.string().nullable() }),
  lead: z.object({ id: z.string(), clientId: z.string().nullable(), firstName: z.string(), lastName: z.string(), email: z.string().nullable(), projectType: z.string().nullable(), city: z.string().nullable(), source: z.string(), status: z.string(), marketingOptIn: z.boolean() }).nullable(),
  clientName: z.string().nullable(),
})

function json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) }

/** Must run inside the same SQL transaction as the source mutation. */
export async function enqueueAutomationEvent(tx: TransactionClient, rawEvent: AutomationEvent) {
  assertDemoMutationAllowed()
  const event = eventSchema.parse(rawEvent)
  const existing = await tx.automationEventOutbox.findUnique({ where: { companyId_eventKey: { companyId: event.companyId, eventKey: event.eventKey } } })
  if (existing) return existing.id
  const company = await tx.company.findUniqueOrThrow({ where: { id: event.companyId }, select: { id: true, name: true, email: true } })
  const lead = event.leadId ? await tx.leadCapture.findFirstOrThrow({ where: { id: event.leadId, companyId: event.companyId }, select: { id: true, clientId: true, firstName: true, lastName: true, email: true, projectType: true, city: true, source: true, status: true, marketingOptIn: true } }) : null
  const client = event.clientId ? await tx.client.findFirstOrThrow({ where: { id: event.clientId, companyId: event.companyId }, select: { name: true } }) : null
  const snapshot = json({ event, company, lead, clientName: client?.name || event.context?.clientName || null })
  const mailbox = event.subjectModel === "EmailMessage" ? await tx.emailMessage.findFirstOrThrow({ where: { id: event.subjectId, companyId: event.companyId }, select: { thread: { select: { channelId: true, channel: { select: { visibility: true } } } } } }) : null
  // Personal mail must not trigger company-wide notifications or CRM effects.
  const workflows = mailbox && mailbox.thread.channel?.visibility !== "SHARED" ? [] : await tx.automationWorkflow.findMany({ where: { companyId: event.companyId, trigger: event.event, status: "ACTIVE" }, orderBy: { id: "asc" } })
  const outbox = await tx.automationEventOutbox.create({ data: { companyId: event.companyId, channelId: mailbox?.thread.channelId, eventKey: event.eventKey, event: event.event, subjectModel: event.subjectModel, subjectId: event.subjectId } })
  for (const workflow of workflows) {
    if (workflow.publishedVersion == null) throw new Error("Publiez une version du scénario avant son exécution")
    const version = await tx.automationWorkflowVersion.findUniqueOrThrow({ where: { workflowId_version: { workflowId: workflow.id, version: workflow.publishedVersion } } })
    if (!version.publishedAt || version.companyId !== event.companyId || version.trigger !== event.event) throw new Error("Version publiée du scénario invalide")
    await tx.automationRun.upsert({ where: { workflowId_eventKey: { workflowId: workflow.id, eventKey: event.eventKey } }, update: {}, create: {
      companyId: event.companyId, workflowId: workflow.id, workflowVersion: version.version,
      event: event.event, eventKey: event.eventKey, subjectModel: event.subjectModel, subjectId: event.subjectId,
      configuration: json({ conditions: version.conditions ?? undefined, actions: version.actions }), input: snapshot,
    } })
  }
  return outbox.id
}

class WorkflowPausedError extends Error {}

async function executeRun(runId: string, companyId: string, eventAt: Date, control: ProcessorLeaseControl) {
  const run = await prisma.automationRun.findFirstOrThrow({ where: { id: runId, companyId }, include: { workflow: { select: { name: true, status: true } } } })
  if (["COMPLETED", "SKIPPED"].includes(run.status)) return "COMPLETED" as const
  if (run.status === "DEAD_LETTER") return "DEAD_LETTER" as const
  if (run.workflow.status === "ARCHIVED") {
    await prisma.$transaction(async tx => {
      await control.assertOwned(tx)
      await tx.automationRun.update({ where: { id: run.id }, data: { status: "SKIPPED", error: "WORKFLOW_ARCHIVED", completedAt: new Date(), wakeAt: null } })
      await tx.automationRunAction.updateMany({ where: { runId: run.id, status: "WAITING" }, data: { status: "SKIPPED", completedAt: new Date() } })
    })
    return "COMPLETED" as const
  }
  if (run.workflow.status !== "ACTIVE") {
    await prisma.automationRun.update({ where: { id: run.id }, data: { status: "PAUSED", ownerId: null, leaseUntil: null } })
    return "PAUSED" as const
  }
  if (run.wakeAt && run.wakeAt > new Date()) {
    await control.assertOwned()
    await prisma.automationRun.updateMany({ where: { id: run.id, companyId, status: { in: ["PAUSED", "WAITING"] }, ownerId: null }, data: { status: "WAITING" } })
    return "WAITING" as const
  }
  const ownerId = randomUUID()
  const now = new Date()
  const claimed = await prisma.automationRun.updateMany({
    where: { id: run.id, companyId, status: { in: ["RUNNING", "FAILED", "PAUSED", "WAITING"] }, OR: [{ ownerId: null }, { leaseUntil: null }, { leaseUntil: { lte: now } }] },
    data: { status: "RUNNING", ownerId, leaseUntil: new Date(now.getTime() + 120_000), attempts: { increment: 1 }, completedAt: null, error: null },
  })
  if (claimed.count !== 1) return "BUSY" as const
  let currentPosition: number | null = null
  let currentType: string | null = null
  let actionStartedAt: Date | null = null
  try {
    if (!run.configuration || !run.input) throw new Error("LEGACY_RUN_REQUIRES_RECONCILIATION")
    const input = snapshotSchema.parse(run.input)
    if (input.event.companyId !== companyId) throw new Error("Contexte de scénario hors société")
    const evaluation = evaluateWorkflowConfiguration(run.configuration, input.lead, input.event.context)
    if (!evaluation.matches) {
      await prisma.automationRun.updateMany({ where: { id: run.id, ownerId }, data: { status: "SKIPPED", output: { reason: "CONDITIONS_NOT_MET", trace: evaluation.trace }, completedAt: new Date() } })
      return "COMPLETED" as const
    }
    for (let position = run.nextActionPosition; position < evaluation.actions.length; position += 1) {
      await control.assertOwned()
      const action = evaluation.actions[position]
      currentPosition = position; currentType = action.type; actionStartedAt = new Date()
      // Enrollment itself has a stable (sequence, lead) key and never restarts
      // a previous occurrence; replay before the checkpoint is safe.
      let enrollmentId: string | undefined
      if (action.type === "ENROLL_SEQUENCE") {
        if (!input.lead) throw new Error("Cette action exige un prospect")
        if ((await prisma.automationWorkflow.findFirstOrThrow({ where: { id: run.workflowId, companyId }, select: { status: true } })).status !== "ACTIVE") throw new WorkflowPausedError()
        enrollmentId = (await enrollLeadInSequenceInternal({ companyId, sequenceId: action.sequenceId, leadId: input.lead.id })).id
      }
      const actionResult = await prisma.$transaction(async (tx) => {
        await control.assertOwned(tx)
        // Row ownership, effect and checkpoint are one transaction. A stale
        // worker or a duplicate checkpoint cannot commit another business effect.
        const owned = await tx.automationRun.updateMany({ where: { id: run.id, companyId, ownerId, status: "RUNNING", nextActionPosition: position, leaseUntil: { gt: new Date() } }, data: { leaseUntil: new Date(Date.now() + 120_000) } })
        if (owned.count !== 1) throw new Error("AUTOMATION_RUN_OWNERSHIP_LOST")
        const workflow = await tx.automationWorkflow.findFirstOrThrow({ where: { id: run.workflowId, companyId }, select: { status: true } })
        if (workflow.status !== "ACTIVE") throw new WorkflowPausedError()
        if (action.type === "WAIT") {
          const previous = await tx.automationRunAction.findUnique({ where: { runId_position: { runId: run.id, position } } })
          const wakeAt = previous?.scheduledAt || new Date(Date.now() + action.delayHours * 3_600_000)
          const output = json({ type: "WAIT", delayHours: action.delayHours })
          const waiting = wakeAt > new Date()
          await tx.automationRunAction.upsert({ where: { runId_position: { runId: run.id, position } },
            create: { runId: run.id, position, output, status: waiting ? "WAITING" : "COMPLETED", startedAt: actionStartedAt, scheduledAt: wakeAt, completedAt: waiting ? null : new Date() },
            update: { output, status: waiting ? "WAITING" : "COMPLETED", scheduledAt: wakeAt, completedAt: waiting ? null : new Date(), errorCode: null } })
          await tx.automationRun.update({ where: { id: run.id }, data: waiting ? { status: "WAITING", wakeAt } : { wakeAt: null, nextActionPosition: position + 1 } })
          return waiting ? "WAITING" as const : "COMPLETED" as const
        }
        let output: Record<string, unknown>
        if (action.type === "ENROLL_SEQUENCE") {
          output = { type: action.type, enrollmentId }
        } else if (action.type === "CREATE_TASK") {
          if (!input.lead && !input.event.clientId) throw new Error("Cette action exige un prospect ou un client")
          const title = renderWorkflowTitle(action.title, input.company, input.lead, input.clientName || undefined, input.event.context)
          const task = await tx.organisationTask.create({ data: { companyId, clientId: input.lead?.clientId || input.event.clientId || null, title, status: "TODO", priority: action.priority, category: input.event.event === "CUSTOMER_HEALTH_CHANGED" ? "SUPPORT" : "SALES", dueDate: new Date(eventAt.getTime() + action.delayHours * 3_600_000) } })
          output = { type: action.type, taskId: task.id }
        } else if (action.type === "NOTIFY_TEAM") {
          const title = renderWorkflowTitle(action.title, input.company, input.lead, input.clientName || undefined, input.event.context)
          let after: string | undefined
          let count = 0
          while (true) {
            const recipients = await tx.membership.findMany({ where: { companyId, status: "ACTIVE", role: { in: ["OWNER", "ADMIN", "SALES"] }, ...(after ? { id: { gt: after } } : {}) }, select: { id: true, userId: true }, orderBy: { id: "asc" }, take: 200 })
            if (!recipients.length) break
            await tx.notification.createMany({ data: recipients.map(({ userId }) => ({ userId, type: "AUTOMATION", title, message: `Règle : ${run.workflow.name}` })) })
            count += recipients.length
            after = recipients[recipients.length - 1].id
          }
          output = { type: action.type, recipients: count }
        } else {
          if (!input.lead) throw new Error("Cette action exige un prospect")
          const updated = await tx.leadCapture.updateMany({ where: { id: input.lead.id, companyId }, data: { status: action.status } })
          if (updated.count !== 1) throw new Error("Prospect du scénario introuvable")
          output = { type: action.type, status: action.status }
        }
        await tx.automationRunAction.upsert({ where: { runId_position: { runId: run.id, position } },
          create: { runId: run.id, position, output: json(output), startedAt: actionStartedAt },
          update: { output: json(output), status: "COMPLETED", completedAt: new Date(), errorCode: null } })
        await tx.automationRun.update({ where: { id: run.id }, data: { nextActionPosition: position + 1 } })
        return "COMPLETED" as const
      }, { timeout: 30_000 })
      if (actionResult === "WAITING") return "WAITING" as const
    }
    const checkpoints = await prisma.automationRunAction.findMany({ where: { runId: run.id }, orderBy: { position: "asc" } })
    await control.assertOwned()
    await prisma.automationRun.updateMany({ where: { id: run.id, ownerId }, data: { status: "COMPLETED", output: json({ trace: evaluation.trace, actions: checkpoints.map((checkpoint) => checkpoint.output), context: input.event.context || null }), completedAt: new Date(), error: null, wakeAt: null } })
    return "COMPLETED" as const
  } catch (error) {
    const paused = error instanceof WorkflowPausedError
    await prisma.$transaction(async tx => {
      await control.assertOwned(tx)
      const saved = await tx.automationRun.updateMany({ where: { id: run.id, ownerId }, data: { status: paused ? "PAUSED" : run.failures + 1 >= 5 ? "DEAD_LETTER" : "FAILED", ...(paused ? {} : { failures: { increment: 1 } }), error: paused ? null : (error instanceof Error ? error.message : "Exécution impossible").slice(0, 500) } })
      if (saved.count && !paused && currentPosition !== null && currentType) {
        const checkpoint = await tx.automationRunAction.findUnique({ where: { runId_position: { runId: run.id, position: currentPosition } }, select: { status: true } })
        if (checkpoint?.status !== "COMPLETED") await tx.automationRunAction.upsert({ where: { runId_position: { runId: run.id, position: currentPosition } },
          create: { runId: run.id, position: currentPosition, output: json({ type: currentType }), status: "FAILED", startedAt: actionStartedAt, completedAt: null, errorCode: "EXECUTION_FAILED" },
          update: { status: "FAILED", completedAt: null, errorCode: "EXECUTION_FAILED" } })
      }
    })
    if (paused) return "PAUSED" as const
    throw error
  } finally {
    await prisma.automationRun.updateMany({ where: { id: run.id, ownerId }, data: { ownerId: null, leaseUntil: null } })
  }
}

export async function dispatchAutomationEvent(id: string) {
  assertDemoMutationAllowed()
  // Resolve the event under the caller's tenant scope before entering the
  // trusted worker context. Every effect below also carries its company ID.
  const event = await prisma.automationEventOutbox.findUniqueOrThrow({ where: { id } })
  return requestContext.exit(async () => {
    const leased = await withProcessorLease(`automation-event:${event.id}`, async (control) => {
      const runs = await prisma.automationRun.findMany({ where: { companyId: event.companyId, eventKey: event.eventKey }, orderBy: { id: "asc" } })
      if (event.status === "COMPLETED" || event.status === "DEAD_LETTER" || event.nextAttemptAt > new Date()) return { workflows: runs.length, completed: 0 }
      let completed = 0
      let pending = false
      let terminalFailure = false
      const errors: string[] = []
      for (const run of runs) {
        await control.assertOwned()
        try {
          const result = await executeRun(run.id, event.companyId, event.createdAt, control)
          if (result === "COMPLETED") completed += 1
          else if (result === "DEAD_LETTER") terminalFailure = true
          else pending = true
        } catch (error) { errors.push((error instanceof Error ? error.message : "Exécution impossible").slice(0, 500)) }
      }
      const attempts = event.attempts + (errors.length ? 1 : 0)
      const states = await prisma.automationRun.findMany({ where: { companyId: event.companyId, eventKey: event.eventKey }, select: { status: true, wakeAt: true } })
      terminalFailure ||= states.some(run => run.status === "DEAD_LETTER")
      const live = states.filter(run => !["COMPLETED", "SKIPPED", "DEAD_LETTER"].includes(run.status))
      const finished = !pending && !errors.length && !terminalFailure
      // Waiting is scheduling, not an error retry. One exhausted sibling must
      // not abandon another run's already persisted deadline.
      const retryAt = live.some(run => run.status !== "WAITING") ? Date.now() + Math.min(3_600_000, 60_000 * 2 ** attempts) : Infinity
      const deadlines = live.filter(run => run.status === "WAITING" && run.wakeAt).map(run => run.wakeAt!.getTime())
      const nextWake = live.length ? Math.min(retryAt, ...deadlines, ...(deadlines.length || Number.isFinite(retryAt) ? [] : [Date.now() + 60_000])) : Date.now()
      await control.assertOwned()
      await prisma.automationEventOutbox.update({ where: { id: event.id }, data: {
        status: finished ? "COMPLETED" : !live.length && terminalFailure ? "DEAD_LETTER" : "PENDING", attempts,
        completedAt: finished ? new Date() : null, error: errors.join(" ; ").slice(0, 1_000) || null,
        nextAttemptAt: new Date(nextWake),
      } })
      return { workflows: runs.length, completed }
    })
    return leased.acquired ? leased.value : { workflows: 0, completed: 0 }
  })
}

export async function processAutomationEvents(limit = 50, companyId?: string) {
  assertDemoMutationAllowed()
  const due = await prisma.automationEventOutbox.findMany({ where: { status: "PENDING", nextAttemptAt: { lte: new Date() }, ...(companyId ? { companyId } : {}) }, orderBy: [{ nextAttemptAt: "asc" }, { id: "asc" }], take: Math.min(100, Math.max(1, limit)), select: { id: true } })
  let completed = 0
  for (const event of due) completed += (await dispatchAutomationEvent(event.id)).completed
  return { examined: due.length, completed }
}
