import { z } from "zod"

import { renderEmailVariables } from "@/lib/automations/email"
import prisma, { type TransactionClient } from "@/lib/prisma"

export const automationTriggerSchema = z.enum(["LEAD_CREATED", "LEAD_STATUS_CHANGED", "QUOTE_STATUS_CHANGED", "EMAIL_RECEIVED", "EMAIL_OPENED", "EMAIL_CLICKED", "PORTAL_APPOINTMENT_REQUESTED", "INTERVENTION_COMPLETED", "CUSTOMER_HEALTH_CHANGED"])

export const workflowConditionsSchema = z.object({
  source: z.string().trim().max(80).optional(),
  leadStatus: z.string().trim().max(40).optional(),
  marketingOptIn: z.boolean().optional(),
  projectTypeContains: z.string().trim().max(100).optional(),
  healthStatus: z.enum(["HEALTHY", "WATCH", "RISK"]).optional(),
  healthScoreBelow: z.number().int().min(0).max(100).optional(),
  healthScoreDropAtLeast: z.number().int().min(1).max(100).optional(),
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

export type AutomationEvent = {
  companyId: string
  event: z.infer<typeof automationTriggerSchema>
  subjectModel: "LeadCapture" | "Quote" | "EmailMessage" | "ClientPortalAppointmentRequest" | "FieldIntervention" | "Client"
  subjectId: string
  eventKey: string
  leadId?: string
  clientId?: string
  context?: WorkflowEventContext
}

type WorkflowEventContext = {
  clientName?: string
  healthStatus?: "HEALTHY" | "WATCH" | "RISK"
  healthScore?: number
  previousHealthScore?: number | null
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

export function workflowConditionsMatch(conditions: z.infer<typeof workflowConditionsSchema>, lead: WorkflowLead | null, context: WorkflowEventContext = {}) {
  if (conditions.source && (!lead || lead.source.toLowerCase() !== conditions.source.toLowerCase())) return false
  if (conditions.leadStatus && (!lead || lead.status !== conditions.leadStatus)) return false
  if (conditions.marketingOptIn !== undefined && (!lead || lead.marketingOptIn !== conditions.marketingOptIn)) return false
  if (conditions.projectTypeContains && (!lead || !lead.projectType?.toLowerCase().includes(conditions.projectTypeContains.toLowerCase()))) return false
  if (conditions.healthStatus && context.healthStatus !== conditions.healthStatus) return false
  if (conditions.healthScoreBelow !== undefined && (context.healthScore === undefined || context.healthScore > conditions.healthScoreBelow)) return false
  if (conditions.healthScoreDropAtLeast !== undefined) {
    if (context.healthScore === undefined || context.previousHealthScore == null || context.previousHealthScore - context.healthScore < conditions.healthScoreDropAtLeast) return false
  }
  return true
}

export function evaluateWorkflowConfiguration(input: unknown, lead: WorkflowLead | null, context: WorkflowEventContext = {}) {
  const config = workflowConfigurationSchema.parse(input)
  const hasConditions = Boolean(config.conditions && Object.values(config.conditions).some((value) => value !== undefined && value !== ""))
  const matches = !hasConditions || workflowConditionsMatch(config.conditions!, lead, context)
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
    const branchMatches = workflowConditionsMatch(action.conditions, lead, context)
    trace.push({ type: "BRANCH", label: action.label, matched: branchMatches, selected: branchMatches ? "TRUE" : "FALSE" })
    actions.push(...(branchMatches ? action.ifTrue : action.ifFalse))
  }
  return { matches, actions, trace }
}

export async function enqueueAutomationEvent(tx: TransactionClient, event: AutomationEvent) {
  return (await import("@/lib/automations/runner")).enqueueAutomationEvent(tx, event)
}

export async function dispatchAutomationEvent(id: string) {
  return (await import("@/lib/automations/runner")).dispatchAutomationEvent(id)
}

export async function processAutomationEvents(limit = 50, companyId?: string) {
  return (await import("@/lib/automations/runner")).processAutomationEvents(limit, companyId)
}

export async function runAutomationEvent(event: AutomationEvent) {
  const id = await prisma.$transaction((tx) => enqueueAutomationEvent(tx, event))
  return dispatchAutomationEvent(id)
}
export function renderWorkflowTitle(template: string, company: { id: string; name: string; email: string | null }, lead: WorkflowLead | null, clientName?: string, context: WorkflowEventContext = {}) {
  const rendered = lead ? renderEmailVariables(template, { company, lead }, false) : template.replaceAll("{{company.name}}", company.name)
  return rendered
    .replaceAll("{{client.name}}", clientName || "Client")
    .replaceAll("{{health.score}}", context.healthScore?.toString() || "—")
    .replaceAll("{{health.previousScore}}", context.previousHealthScore?.toString() || "—")
    .replaceAll("{{health.status}}", context.healthStatus || "—")
}
