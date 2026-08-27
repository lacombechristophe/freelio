"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { workflowConfigurationSchema, automationTriggerSchema } from "@/lib/automations/engine"
import { enrollLeadInSequenceInternal, processDueSequenceEmails } from "@/lib/automations/sequences"
import { withAuth } from "@/lib/auth-wrapper"
import prisma from "@/lib/prisma"
import { nextSequenceExecution, sequenceTimezoneIsValid } from "@/lib/automations/schedule"

const idSchema = z.string().cuid()
const templateSchema = z.object({ name: z.string().trim().min(2).max(120), category: z.string().trim().min(2).max(50), subject: z.string().trim().min(2).max(180), bodyHtml: z.string().trim().min(10).max(50_000) })
const sequenceSchema = z.object({ name: z.string().trim().min(2).max(120), description: z.string().trim().max(500).optional() })
const stepSchema = z.object({
  sequenceId: idSchema,
  type: z.enum(["EMAIL", "MANUAL_EMAIL", "CALL_TASK", "GENERAL_TASK"]).default("EMAIL"),
  templateId: idSchema.optional(),
  delayHours: z.coerce.number().int().min(0).max(8_760),
  subject: z.string().trim().max(180).optional(),
  bodyHtml: z.string().trim().max(50_000).optional(),
  taskTitle: z.string().trim().max(180).optional(),
  taskNotes: z.string().trim().max(2_000).optional(),
  taskPriority: z.coerce.number().int().min(1).max(3).default(2),
  pauseUntilComplete: z.boolean().default(false),
}).superRefine((value, context) => {
  if (value.type === "EMAIL" && !value.templateId && (!value.subject || !value.bodyHtml)) context.addIssue({ code: "custom", message: "Choisissez un modèle ou renseignez l’objet et le contenu" })
  if (value.type !== "EMAIL" && !value.taskTitle) context.addIssue({ code: "custom", path: ["taskTitle"], message: "Le titre de la tâche est requis" })
})
const statusSchema = z.enum(["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"])
const sequenceSettingsSchema = z.object({
  sequenceId: idSchema,
  businessDaysOnly: z.boolean(),
  sendWindowStart: z.coerce.number().int().min(0).max(22),
  sendWindowEnd: z.coerce.number().int().min(1).max(23),
  timezone: z.string().trim().min(1).max(100).refine(sequenceTimezoneIsValid, "Fuseau horaire invalide"),
}).superRefine((value, context) => {
  if (value.sendWindowStart >= value.sendWindowEnd) context.addIssue({ code: "custom", path: ["sendWindowEnd"], message: "La fin de fenêtre doit être postérieure au début" })
})

export async function getAutomationDashboard() {
  return withAuth(async ({ companyId }) => {
    const [templates, sequences, workflows, deliveries, leads] = await Promise.all([
      prisma.emailTemplate.findMany({ where: { companyId, status: "ACTIVE" }, orderBy: { updatedAt: "desc" }, take: 100 }),
      prisma.emailSequence.findMany({
        where: { companyId, status: { not: "ARCHIVED" } },
        include: {
          steps: { orderBy: { position: "asc" }, include: { deliveries: { select: { status: true } }, taskExecutions: { select: { completedAt: true, organisationTask: { select: { status: true } } } } } },
          enrollments: { orderBy: { enrolledAt: "desc" }, take: 20, include: { leadCapture: { select: { firstName: true, lastName: true, email: true } }, taskExecutions: { orderBy: { createdAt: "desc" }, include: { step: { select: { taskTitle: true, type: true } }, organisationTask: { select: { id: true, status: true, title: true } } } } } },
          _count: { select: { enrollments: true, deliveries: true } },
        },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.automationWorkflow.findMany({ where: { companyId, status: { not: "ARCHIVED" } }, include: { runs: { orderBy: { startedAt: "desc" }, take: 5 } }, orderBy: { updatedAt: "desc" } }),
      prisma.emailDelivery.findMany({ where: { companyId }, include: { sequence: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 50 }),
      prisma.leadCapture.findMany({ where: { companyId, marketingOptIn: true, email: { not: null }, status: { notIn: ["SPAM", "ARCHIVED"] } }, select: { id: true, firstName: true, lastName: true, email: true, projectType: true }, orderBy: { createdAt: "desc" }, take: 250 }),
    ])
    return { templates, sequences, workflows, deliveries, leads }
  }, "automation.read")
}

export async function createEmailTemplate(input: unknown) {
  return withAuth(async ({ companyId }) => {
    const data = templateSchema.parse(input)
    await prisma.emailTemplate.create({ data: { companyId, ...data } })
    revalidatePath("/dashboard/automatisations")
    return { success: true as const }
  }, "automation.write")
}

export async function createEmailSequence(input: unknown) {
  return withAuth(async ({ companyId }) => {
    const data = sequenceSchema.parse(input)
    await prisma.emailSequence.create({ data: { companyId, ...data } })
    revalidatePath("/dashboard/automatisations")
    return { success: true as const }
  }, "automation.write")
}

export async function addEmailSequenceStep(input: unknown) {
  return withAuth(async ({ companyId }) => {
    const data = stepSchema.parse(input)
    const sequence = await prisma.emailSequence.findFirst({ where: { id: data.sequenceId, companyId }, include: { steps: { orderBy: { position: "desc" }, take: 1 } } })
    if (!sequence) throw new Error("Séquence introuvable")
    const template = data.type === "EMAIL" && data.templateId ? await prisma.emailTemplate.findFirst({ where: { id: data.templateId, companyId, status: "ACTIVE" } }) : null
    const subject = data.type === "EMAIL" ? data.subject || template?.subject : ""
    const bodyHtml = data.type === "EMAIL" ? data.bodyHtml || template?.bodyHtml : ""
    if (data.type === "EMAIL" && (!subject || !bodyHtml)) throw new Error("Renseignez un objet et un contenu, ou choisissez un modèle")
    await prisma.emailSequenceStep.create({ data: { sequenceId: sequence.id, position: (sequence.steps[0]?.position ?? -1) + 1, delayHours: data.delayHours, type: data.type, subject: subject || "", bodyHtml: bodyHtml || "", taskTitle: data.type === "EMAIL" ? null : data.taskTitle || null, taskNotes: data.type === "EMAIL" ? null : data.taskNotes || null, taskPriority: data.taskPriority, pauseUntilComplete: data.type === "EMAIL" ? false : data.pauseUntilComplete } })
    revalidatePath("/dashboard/automatisations")
    return { success: true as const }
  }, "automation.write")
}

export async function updateEmailSequenceStatus(sequenceId: string, status: string) {
  return withAuth(async ({ companyId }) => {
    const id = idSchema.parse(sequenceId)
    const nextStatus = statusSchema.parse(status)
    const sequence = await prisma.emailSequence.findFirst({ where: { id, companyId }, include: { _count: { select: { steps: true } } } })
    if (!sequence) throw new Error("Séquence introuvable")
    if (nextStatus === "ACTIVE" && sequence._count.steps === 0) throw new Error("Ajoutez une étape avant d'activer la séquence")
    await prisma.emailSequence.update({ where: { id }, data: { status: nextStatus } })
    revalidatePath("/dashboard/automatisations")
    return { success: true as const }
  }, "automation.write")
}

export async function updateEmailSequenceSettings(input: unknown) {
  return withAuth(async ({ companyId }) => {
    const data = sequenceSettingsSchema.parse(input)
    const sequence = await prisma.emailSequence.findFirst({ where: { id: data.sequenceId, companyId }, select: { id: true } })
    if (!sequence) throw new Error("Séquence introuvable")
    await prisma.emailSequence.update({ where: { id: sequence.id }, data: { businessDaysOnly: data.businessDaysOnly, sendWindowStart: data.sendWindowStart, sendWindowEnd: data.sendWindowEnd, timezone: data.timezone } })
    revalidatePath("/dashboard/automatisations")
    return { success: true as const }
  }, "automation.write")
}

export async function enrollLeadInSequence(sequenceId: string, leadId: string) {
  return withAuth(async ({ companyId }) => {
    await enrollLeadInSequenceInternal({ companyId, sequenceId: idSchema.parse(sequenceId), leadId: idSchema.parse(leadId) })
    revalidatePath("/dashboard/automatisations")
    return { success: true as const }
  }, "automation.write")
}

export async function stopSequenceEnrollment(enrollmentId: string) {
  return withAuth(async ({ companyId }) => {
    const enrollment = await prisma.emailSequenceEnrollment.findFirst({ where: { id: idSchema.parse(enrollmentId), sequence: { companyId } }, select: { id: true } })
    if (!enrollment) throw new Error("Inscription introuvable")
    await prisma.emailSequenceEnrollment.update({ where: { id: enrollment.id }, data: { status: "STOPPED", stopReason: "MANUAL", nextSendAt: null, completedAt: new Date() } })
    revalidatePath("/dashboard/automatisations")
    return { success: true as const }
  }, "automation.write")
}

export async function pauseSequenceEnrollment(enrollmentId: string) {
  return withAuth(async ({ companyId }) => {
    const enrollment = await prisma.emailSequenceEnrollment.findFirst({ where: { id: idSchema.parse(enrollmentId), sequence: { companyId }, status: "ACTIVE" }, select: { id: true } })
    if (!enrollment) throw new Error("Inscription active introuvable")
    await prisma.emailSequenceEnrollment.update({ where: { id: enrollment.id }, data: { status: "PAUSED", stopReason: "MANUAL_PAUSE" } })
    revalidatePath("/dashboard/automatisations")
    return { success: true as const }
  }, "automation.write")
}

export async function resumeSequenceEnrollment(enrollmentId: string) {
  return withAuth(async ({ companyId }) => {
    const enrollment = await prisma.emailSequenceEnrollment.findFirst({ where: { id: idSchema.parse(enrollmentId), sequence: { companyId }, status: "PAUSED" }, include: { sequence: { select: { businessDaysOnly: true, sendWindowStart: true, sendWindowEnd: true, timezone: true } } } })
    if (!enrollment) throw new Error("Inscription en pause introuvable")
    const nextSendAt = nextSequenceExecution(new Date(), 0, enrollment.sequence)
    await prisma.emailSequenceEnrollment.update({ where: { id: enrollment.id }, data: { status: "ACTIVE", stopReason: null, nextSendAt } })
    revalidatePath("/dashboard/automatisations")
    return { success: true as const }
  }, "automation.write")
}

export async function createAutomationWorkflow(input: unknown) {
  return withAuth(async ({ companyId }) => {
    const parsed = z.object({ name: z.string().trim().min(2).max(120), trigger: automationTriggerSchema, conditions: z.unknown().optional(), actions: z.unknown() }).parse(input)
    const configuration = workflowConfigurationSchema.parse({ conditions: parsed.conditions, actions: parsed.actions })
    await prisma.automationWorkflow.create({ data: { companyId, name: parsed.name, trigger: parsed.trigger, conditions: configuration.conditions || undefined, actions: configuration.actions } })
    revalidatePath("/dashboard/automatisations")
    return { success: true as const }
  }, "automation.write")
}

export async function updateAutomationWorkflowStatus(workflowId: string, status: string) {
  return withAuth(async ({ companyId }) => {
    const id = idSchema.parse(workflowId)
    const workflow = await prisma.automationWorkflow.findFirst({ where: { id, companyId }, select: { id: true } })
    if (!workflow) throw new Error("Automatisation introuvable")
    await prisma.automationWorkflow.update({ where: { id }, data: { status: statusSchema.parse(status) } })
    revalidatePath("/dashboard/automatisations")
    return { success: true as const }
  }, "automation.write")
}

export async function processSequenceEmailsNow() {
  return withAuth(async () => {
    const summary = await processDueSequenceEmails(100)
    revalidatePath("/dashboard/automatisations")
    return { success: true as const, summary }
  }, "automation.write")
}
