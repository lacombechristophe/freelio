import { Prisma } from "@prisma/client"
import { z } from "zod"

import { renderEmailVariables } from "@/lib/automations/email"
import { enrollLeadInSequenceInternal } from "@/lib/automations/sequences"
import prisma from "@/lib/prisma"

export const automationTriggerSchema = z.enum(["LEAD_CREATED", "LEAD_STATUS_CHANGED", "QUOTE_STATUS_CHANGED", "EMAIL_RECEIVED", "EMAIL_OPENED", "EMAIL_CLICKED", "PORTAL_APPOINTMENT_REQUESTED", "INTERVENTION_COMPLETED"])

export const workflowConditionsSchema = z.object({
  source: z.string().trim().max(80).optional(),
  leadStatus: z.string().trim().max(40).optional(),
  marketingOptIn: z.boolean().optional(),
  projectTypeContains: z.string().trim().max(100).optional(),
}).partial()

const leafActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ENROLL_SEQUENCE"), sequenceId: z.string().cuid() }),
  z.object({ type: z.literal("CREATE_TASK"), title: z.string().trim().min(2).max(180), delayHours: z.number().int().min(0).max(8_760).default(0), priority: z.number().int().min(1).max(4).default(2) }),
  z.object({ type: z.literal("NOTIFY_TEAM"), title: z.string().trim().min(2).max(180) }),
  z.object({ type: z.literal("UPDATE_LEAD_STATUS"), status: z.enum(["NEW", "CONTACTED", "QUALIFIED", "ARCHIVED", "SPAM"]) }),
])

const branchActionSchema = z.object({
  type: z.literal("CONDITIONAL_BRANCH"),
  label: z.string().trim().min(2).max(120),
  conditions: workflowConditionsSchema,
  ifTrue: z.array(leafActionSchema).min(1).max(5),
  ifFalse: z.array(leafActionSchema).max(5).default([]),
})

const actionSchema = z.union([leafActionSchema, branchActionSchema])

export const workflowConfigurationSchema = z.object({
  conditions: workflowConditionsSchema.optional(),
  actions: z.array(actionSchema).min(1).max(10),
})

type AutomationEvent = {
  companyId: string
  event: z.infer<typeof automationTriggerSchema>
  subjectModel: "LeadCapture" | "Quote" | "EmailMessage" | "ClientPortalAppointmentRequest" | "FieldIntervention"
  subjectId: string
  eventKey: string
  leadId?: string
  clientId?: string
}

type WorkflowLead = {
  id: string
  clientId: string | null
  firstName: string
  lastName: string
  email: string | null
  projectType: string | null
  city: string | null
  source: string
  status: string
  marketingOptIn: boolean
}

export function workflowConditionsMatch(conditions: z.infer<typeof workflowConditionsSchema>, lead: WorkflowLead) {
  if (conditions.source && lead.source.toLowerCase() !== conditions.source.toLowerCase()) return false
  if (conditions.leadStatus && lead.status !== conditions.leadStatus) return false
  if (conditions.marketingOptIn !== undefined && lead.marketingOptIn !== conditions.marketingOptIn) return false
  if (conditions.projectTypeContains && !lead.projectType?.toLowerCase().includes(conditions.projectTypeContains.toLowerCase())) return false
  return true
}

export function evaluateWorkflowConfiguration(input: unknown, lead: WorkflowLead | null) {
  const config = workflowConfigurationSchema.parse(input)
  const hasConditions = Boolean(config.conditions && Object.values(config.conditions).some((value) => value !== undefined && value !== ""))
  const matches = !hasConditions || Boolean(lead && workflowConditionsMatch(config.conditions!, lead))
  const trace: Array<{ type: "ROOT" | "BRANCH"; label: string; matched: boolean; selected?: "TRUE" | "FALSE" }> = [
    { type: "ROOT", label: "Conditions d’inscription", matched: matches },
  ]
  if (!matches) return { matches, actions: [] as Array<z.infer<typeof leafActionSchema>>, trace }
  const actions: Array<z.infer<typeof leafActionSchema>> = []
  for (const action of config.actions) {
    if (action.type !== "CONDITIONAL_BRANCH") {
      actions.push(action)
      continue
    }
    const branchMatches = Boolean(lead && workflowConditionsMatch(action.conditions, lead))
    trace.push({ type: "BRANCH", label: action.label, matched: branchMatches, selected: branchMatches ? "TRUE" : "FALSE" })
    actions.push(...(branchMatches ? action.ifTrue : action.ifFalse))
  }
  return { matches, actions, trace }
}

export async function runAutomationEvent(event: AutomationEvent) {
  const lead = event.leadId ? await prisma.leadCapture.findFirst({
    where: { id: event.leadId, companyId: event.companyId },
    select: { id: true, clientId: true, firstName: true, lastName: true, email: true, projectType: true, city: true, source: true, status: true, marketingOptIn: true },
  }) : null
  const company = await prisma.company.findUnique({ where: { id: event.companyId }, select: { id: true, name: true, email: true } })
  if (!company) return { workflows: 0, completed: 0 }
  const workflows = await prisma.automationWorkflow.findMany({ where: { companyId: event.companyId, trigger: event.event, status: "ACTIVE" } })
  let completed = 0

  for (const workflow of workflows) {
    let runId: string
    try {
      const run = await prisma.automationRun.create({
        data: { companyId: event.companyId, workflowId: workflow.id, event: event.event, eventKey: event.eventKey, subjectModel: event.subjectModel, subjectId: event.subjectId },
      })
      runId = run.id
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue
      throw error
    }

    try {
      const evaluation = evaluateWorkflowConfiguration({ conditions: workflow.conditions ?? undefined, actions: workflow.actions }, lead)
      if (!evaluation.matches) {
        await prisma.automationRun.update({ where: { id: runId }, data: { status: "SKIPPED", output: { reason: "CONDITIONS_NOT_MET" }, completedAt: new Date() } })
        continue
      }
      const output: Array<Record<string, unknown>> = []
      for (const action of evaluation.actions) {
        if (action.type === "ENROLL_SEQUENCE") {
          if (!lead) throw new Error("Cette action exige un prospect")
          const enrollment = await enrollLeadInSequenceInternal({ companyId: event.companyId, sequenceId: action.sequenceId, leadId: lead.id })
          output.push({ type: action.type, enrollmentId: enrollment.id })
        } else if (action.type === "CREATE_TASK") {
          if (!lead && !event.clientId) throw new Error("Cette action exige un prospect ou un client")
          const title = lead ? renderEmailVariables(action.title, { company, lead }, false) : action.title
          const dueDate = new Date(Date.now() + action.delayHours * 60 * 60 * 1_000)
          const task = await prisma.organisationTask.create({ data: { companyId: event.companyId, clientId: lead?.clientId || event.clientId || null, title, status: "TODO", priority: action.priority, category: "SALES", dueDate } })
          output.push({ type: action.type, taskId: task.id })
        } else if (action.type === "NOTIFY_TEAM") {
          const title = lead ? renderEmailVariables(action.title, { company, lead }, false) : action.title
          const recipients = await prisma.membership.findMany({ where: { companyId: event.companyId, status: "ACTIVE", role: { in: ["OWNER", "ADMIN", "SALES"] } }, select: { userId: true } })
          if (recipients.length) await prisma.notification.createMany({ data: recipients.map(({ userId }) => ({ userId, type: "AUTOMATION", title, message: `Règle : ${workflow.name}` })) })
          output.push({ type: action.type, recipients: recipients.length })
        } else if (action.type === "UPDATE_LEAD_STATUS") {
          if (!lead) throw new Error("Cette action exige un prospect")
          await prisma.leadCapture.update({ where: { id: lead.id }, data: { status: action.status } })
          output.push({ type: action.type, status: action.status })
        }
      }
      await prisma.automationRun.update({ where: { id: runId }, data: { status: "COMPLETED", output: { trace: evaluation.trace, actions: output } as Prisma.InputJsonValue, completedAt: new Date() } })
      completed += 1
    } catch (error) {
      await prisma.automationRun.update({ where: { id: runId }, data: { status: "FAILED", error: (error instanceof Error ? error.message : "Exécution impossible").slice(0, 500), completedAt: new Date() } })
    }
  }
  return { workflows: workflows.length, completed }
}
