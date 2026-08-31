"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { evaluateWorkflowConfiguration, workflowConfigurationSchema, automationTriggerSchema } from "@/lib/automations/engine"
import { enrollLeadInSequenceInternal, processDueSequenceEmails } from "@/lib/automations/sequences"
import { withAuth } from "@/lib/auth-wrapper"
import prisma from "@/lib/prisma"
import { nextSequenceExecution, sequenceTimezoneIsValid } from "@/lib/automations/schedule"
import { customerHealthStatus } from "@/lib/operations/customer-health"
import { automationProcessRateLimit } from "@/lib/rate-limit"
import { logAction } from "@/lib/audit"

const idSchema = z.string().cuid()
const templateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  category: z.string().trim().min(2).max(50),
  subject: z.string().trim().min(2).max(180),
  bodyHtml: z.string().trim().min(10).max(50_000),
})
const sequenceSchema = z.object({ name: z.string().trim().min(2).max(120), description: z.string().trim().max(500).optional() })
const templateUpdateSchema = templateSchema.extend({ id: idSchema })
const sequenceUpdateSchema = sequenceSchema.extend({ id: idSchema })
const stepSchema = z
  .object({
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
  })
  .superRefine((value, context) => {
    if (value.type === "EMAIL" && !value.templateId && (!value.subject || !value.bodyHtml))
      context.addIssue({ code: "custom", message: "Choisissez un modèle ou renseignez l’objet et le contenu" })
    if (value.type !== "EMAIL" && !value.taskTitle) context.addIssue({ code: "custom", path: ["taskTitle"], message: "Le titre de la tâche est requis" })
  })
const statusSchema = z.enum(["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"])
const sequenceSettingsSchema = z
  .object({
    sequenceId: idSchema,
    businessDaysOnly: z.boolean(),
    sendWindowStart: z.coerce.number().int().min(0).max(22),
    sendWindowEnd: z.coerce.number().int().min(1).max(23),
    timezone: z.string().trim().min(1).max(100).refine(sequenceTimezoneIsValid, "Fuseau horaire invalide"),
  })
  .superRefine((value, context) => {
    if (value.sendWindowStart >= value.sendWindowEnd) context.addIssue({ code: "custom", path: ["sendWindowEnd"], message: "La fin de fenêtre doit être postérieure au début" })
  })

const workflowMutationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  trigger: automationTriggerSchema,
  conditions: z.unknown().optional(),
  actions: z.unknown(),
})

async function unusedSequence(sequenceId: string, companyId: string) {
  const sequence = await prisma.emailSequence.findFirst({
    where: { id: sequenceId, companyId },
    select: { id: true, status: true, _count: { select: { enrollments: true } } },
  })
  if (!sequence) throw new Error("Séquence introuvable")
  if (sequence.status === "ACTIVE") throw new Error("Mettez la séquence en pause avant de modifier ses étapes")
  if (sequence._count.enrollments > 0) throw new Error("Les étapes d’une séquence déjà utilisée sont figées. Dupliquez-la pour créer une nouvelle version.")
  return sequence
}

function nextCopyName(name: string, existingNames: string[]) {
  const used = new Set(existingNames.map((value) => value.toLocaleLowerCase("fr")))
  for (let index = 1; index <= 999; index += 1) {
    const suffix = index === 1 ? " (copie)" : ` (copie ${index})`
    const candidate = `${name.slice(0, 120 - suffix.length)}${suffix}`
    if (!used.has(candidate.toLocaleLowerCase("fr"))) return candidate
  }
  throw new Error("Impossible de générer un nom de copie disponible")
}

function assertWorkflowCompatibility(trigger: z.infer<typeof automationTriggerSchema>, configuration: z.infer<typeof workflowConfigurationSchema>) {
  if (trigger !== "CUSTOMER_HEALTH_CHANGED") return
  const leadOnlyAction = configuration.actions.some(
    (action) =>
      action.type === "ENROLL_SEQUENCE" ||
      action.type === "UPDATE_LEAD_STATUS" ||
      (action.type === "CONDITIONAL_BRANCH" && [...action.ifTrue, ...action.ifFalse].some((nested) => nested.type === "ENROLL_SEQUENCE" || nested.type === "UPDATE_LEAD_STATUS")),
  )
  if (leadOnlyAction) throw new Error("Une variation de santé peut créer une tâche ou notifier l’équipe, mais ne peut pas modifier un prospect ni l’inscrire dans une séquence")
}

export async function getAutomationDashboard() {
  return withAuth(async ({ companyId }) => {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000)
    const [templates, sequences, workflows, deliveries, leads, clients, deliveryStats, runStats, emailChannel, stepDeliveryStats] = await Promise.all([
      prisma.emailTemplate.findMany({ where: { companyId, status: "ACTIVE" }, orderBy: { updatedAt: "desc" }, take: 100 }),
      prisma.emailSequence.findMany({
        where: { companyId, status: { not: "ARCHIVED" } },
        include: {
          steps: { orderBy: { position: "asc" } },
          enrollments: {
            orderBy: { enrolledAt: "desc" },
            take: 20,
            include: {
              leadCapture: { select: { firstName: true, lastName: true, email: true } },
              taskExecutions: {
                orderBy: { createdAt: "desc" },
                include: { step: { select: { taskTitle: true, type: true } }, organisationTask: { select: { id: true, status: true, title: true } } },
              },
            },
          },
          _count: { select: { enrollments: true, deliveries: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 200,
      }),
      prisma.automationWorkflow.findMany({
        where: { companyId, status: { not: "ARCHIVED" } },
        include: { runs: { orderBy: { startedAt: "desc" }, take: 5 }, versions: { orderBy: { version: "desc" }, take: 5 } },
        orderBy: { updatedAt: "desc" },
        take: 200,
      }),
      prisma.emailDelivery.findMany({ where: { companyId }, include: { sequence: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 50 }),
      prisma.leadCapture.findMany({
        where: { companyId, marketingOptIn: true, email: { not: null }, status: { notIn: ["SPAM", "ARCHIVED"] } },
        select: { id: true, clientId: true, firstName: true, lastName: true, email: true, projectType: true, city: true, source: true, status: true, marketingOptIn: true },
        orderBy: { createdAt: "desc" },
        take: 250,
      }),
      prisma.client.findMany({
        where: { companyId },
        select: { id: true, name: true, relationScore: true, healthSnapshots: { select: { score: true }, orderBy: { computedAt: "desc" }, take: 2 } },
        orderBy: { name: "asc" },
        take: 300,
      }),
      prisma.emailDelivery.groupBy({ where: { companyId, createdAt: { gte: since } }, by: ["status"], _count: { _all: true } }),
      prisma.automationRun.groupBy({ where: { companyId, startedAt: { gte: since } }, by: ["status"], _count: { _all: true } }),
      prisma.communicationChannel.findFirst({ where: { companyId, provider: "RESEND" }, select: { status: true, emailAddress: true, lastError: true } }),
      prisma.emailDelivery.groupBy({ where: { companyId, stepId: { not: null } }, by: ["stepId", "status"], _count: { _all: true } }),
    ])
    const deliveryStatsByStep = new Map<string, Record<string, number>>()
    for (const item of stepDeliveryStats) {
      if (!item.stepId) continue
      const stats = deliveryStatsByStep.get(item.stepId) ?? {}
      stats[item.status] = item._count._all
      deliveryStatsByStep.set(item.stepId, stats)
    }
    return {
      templates: templates.map((template) => ({
        id: template.id,
        name: template.name,
        category: template.category,
        subject: template.subject,
        bodyHtml: template.bodyHtml,
        status: template.status,
        updatedAt: template.updatedAt.toISOString(),
      })),
      sequences: sequences.map((sequence) => ({
        id: sequence.id,
        name: sequence.name,
        description: sequence.description,
        status: sequence.status,
        businessDaysOnly: sequence.businessDaysOnly,
        sendWindowStart: sequence.sendWindowStart,
        sendWindowEnd: sequence.sendWindowEnd,
        timezone: sequence.timezone,
        updatedAt: sequence.updatedAt.toISOString(),
        _count: sequence._count,
        steps: sequence.steps.map((step) => ({
          id: step.id,
          position: step.position,
          delayHours: step.delayHours,
          type: step.type,
          subject: step.subject,
          bodyHtml: step.bodyHtml,
          taskTitle: step.taskTitle,
          taskNotes: step.taskNotes,
          taskPriority: step.taskPriority,
          pauseUntilComplete: step.pauseUntilComplete,
          deliveryStats: deliveryStatsByStep.get(step.id) ?? {},
        })),
        enrollments: sequence.enrollments.map((enrollment) => ({
          id: enrollment.id,
          status: enrollment.status,
          nextStepPosition: enrollment.nextStepPosition,
          nextSendAt: enrollment.nextSendAt?.toISOString() ?? null,
          lastSentAt: enrollment.lastSentAt?.toISOString() ?? null,
          stopReason: enrollment.stopReason,
          enrolledAt: enrollment.enrolledAt.toISOString(),
          completedAt: enrollment.completedAt?.toISOString() ?? null,
          leadCapture: enrollment.leadCapture,
          taskExecutions: enrollment.taskExecutions.map((execution) => ({
            completedAt: execution.completedAt?.toISOString() ?? null,
            step: execution.step,
            organisationTask: execution.organisationTask,
          })),
        })),
      })),
      workflows: workflows.map((workflow) => ({
        id: workflow.id,
        name: workflow.name,
        trigger: workflow.trigger,
        status: workflow.status,
        conditions: workflow.conditions,
        actions: workflow.actions,
        publishedVersion: workflow.publishedVersion,
        updatedAt: workflow.updatedAt.toISOString(),
        runs: workflow.runs.map((run) => ({
          id: run.id,
          event: run.event,
          subjectModel: run.subjectModel,
          subjectId: run.subjectId,
          status: run.status,
          output: run.output,
          error: run.error,
          startedAt: run.startedAt.toISOString(),
          completedAt: run.completedAt?.toISOString() ?? null,
        })),
        versions: workflow.versions.map((version) => ({
          id: version.id,
          version: version.version,
          status: version.status,
          trigger: version.trigger,
          publishedAt: version.publishedAt?.toISOString() ?? null,
          createdAt: version.createdAt.toISOString(),
        })),
      })),
      deliveries: deliveries.map((delivery) => ({
        id: delivery.id,
        recipientEmail: delivery.recipientEmail,
        subject: delivery.subject,
        status: delivery.status,
        error: delivery.error,
        scheduledAt: delivery.scheduledAt.toISOString(),
        sentAt: delivery.sentAt?.toISOString() ?? null,
        createdAt: delivery.createdAt.toISOString(),
        sequence: delivery.sequence,
      })),
      leads,
      clients: clients.map((client) => ({
        id: client.id,
        name: client.name,
        score: client.relationScore,
        status: customerHealthStatus(client.relationScore),
        previousScore: client.healthSnapshots[1]?.score ?? client.healthSnapshots[0]?.score ?? null,
      })),
      stats: {
        deliveries: Object.fromEntries(deliveryStats.map((item) => [item.status, item._count._all])),
        runs: Object.fromEntries(runStats.map((item) => [item.status, item._count._all])),
      },
      readiness: {
        emailProviderConfigured: emailChannel?.status === "ACTIVE" || Boolean(process.env.RESEND_API_KEY?.trim() && process.env.EMAIL_FROM?.trim()),
        processorConfigured: Boolean(process.env.AUTOMATION_CRON_SECRET?.trim()),
        channel: emailChannel,
      },
    }
  }, "automation.read")
}

export async function createEmailTemplate(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = templateSchema.parse(input)
    const template = await prisma.emailTemplate.create({ data: { companyId, ...data } })
    await logAction({ userId, action: "CREATE_EMAIL_TEMPLATE", resource: "EMAIL_TEMPLATE", resourceId: template.id, payload: { name: template.name } })
    revalidatePath("/dashboard/automatisations")
    return { success: true as const }
  }, "automation.write")
}

export async function updateEmailTemplate(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = templateUpdateSchema.parse(input)
    const template = await prisma.emailTemplate.findFirst({ where: { id: data.id, companyId, status: "ACTIVE" }, select: { id: true } })
    if (!template) throw new Error("Modèle introuvable")
    await prisma.emailTemplate.update({ where: { id: template.id }, data: { name: data.name, category: data.category, subject: data.subject, bodyHtml: data.bodyHtml } })
    await logAction({ userId, action: "UPDATE_EMAIL_TEMPLATE", resource: "EMAIL_TEMPLATE", resourceId: template.id, payload: { name: data.name } })
    revalidatePath("/dashboard/automatisations")
    return { success: true as const }
  }, "automation.write")
}

export async function archiveEmailTemplate(templateId: string) {
  return withAuth(async ({ companyId, userId }) => {
    const id = idSchema.parse(templateId)
    const template = await prisma.emailTemplate.findFirst({ where: { id, companyId, status: "ACTIVE" }, select: { id: true, name: true } })
    if (!template) throw new Error("Modèle introuvable")
    await prisma.emailTemplate.update({ where: { id: template.id }, data: { status: "ARCHIVED" } })
    await logAction({ userId, action: "ARCHIVE_EMAIL_TEMPLATE", resource: "EMAIL_TEMPLATE", resourceId: template.id, payload: { name: template.name } })
    revalidatePath("/dashboard/automatisations")
    return { success: true as const }
  }, "automation.write")
}

export async function createEmailSequence(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = sequenceSchema.parse(input)
    const sequence = await prisma.emailSequence.create({ data: { companyId, ...data } })
    await logAction({ userId, action: "CREATE_EMAIL_SEQUENCE", resource: "EMAIL_SEQUENCE", resourceId: sequence.id, payload: { name: sequence.name } })
    revalidatePath("/dashboard/automatisations")
    return { success: true as const }
  }, "automation.write")
}

export async function updateEmailSequence(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = sequenceUpdateSchema.parse(input)
    const sequence = await prisma.emailSequence.findFirst({ where: { id: data.id, companyId, status: { not: "ARCHIVED" } }, select: { id: true } })
    if (!sequence) throw new Error("Séquence introuvable")
    await prisma.emailSequence.update({ where: { id: sequence.id }, data: { name: data.name, description: data.description || null } })
    await logAction({ userId, action: "UPDATE_EMAIL_SEQUENCE", resource: "EMAIL_SEQUENCE", resourceId: sequence.id, payload: { name: data.name } })
    revalidatePath("/dashboard/automatisations")
    return { success: true as const }
  }, "automation.write")
}

export async function duplicateEmailSequence(sequenceId: string) {
  return withAuth(async ({ companyId, userId }) => {
    const id = idSchema.parse(sequenceId)
    const [source, names] = await Promise.all([
      prisma.emailSequence.findFirst({ where: { id, companyId, status: { not: "ARCHIVED" } }, include: { steps: { orderBy: { position: "asc" } } } }),
      prisma.emailSequence.findMany({ where: { companyId }, select: { name: true } }),
    ])
    if (!source) throw new Error("Séquence introuvable")
    const name = nextCopyName(
      source.name,
      names.map((item) => item.name),
    )
    const copy = await prisma.emailSequence.create({
      data: {
        companyId,
        name,
        description: source.description,
        businessDaysOnly: source.businessDaysOnly,
        sendWindowStart: source.sendWindowStart,
        sendWindowEnd: source.sendWindowEnd,
        timezone: source.timezone,
        steps: {
          create: source.steps.map((step) => ({
            position: step.position,
            delayHours: step.delayHours,
            type: step.type,
            subject: step.subject,
            bodyHtml: step.bodyHtml,
            taskTitle: step.taskTitle,
            taskNotes: step.taskNotes,
            taskPriority: step.taskPriority,
            pauseUntilComplete: step.pauseUntilComplete,
          })),
        },
      },
    })
    await logAction({ userId, action: "DUPLICATE_EMAIL_SEQUENCE", resource: "EMAIL_SEQUENCE", resourceId: copy.id, payload: { sourceId: source.id, name } })
    revalidatePath("/dashboard/automatisations")
    return { success: true as const, id: copy.id }
  }, "automation.write")
}

export async function addEmailSequenceStep(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = stepSchema.parse(input)
    await unusedSequence(data.sequenceId, companyId)
    const sequence = await prisma.emailSequence.findFirstOrThrow({ where: { id: data.sequenceId, companyId }, include: { steps: { orderBy: { position: "desc" }, take: 1 } } })
    const template = data.type === "EMAIL" && data.templateId ? await prisma.emailTemplate.findFirst({ where: { id: data.templateId, companyId, status: "ACTIVE" } }) : null
    const subject = data.type === "EMAIL" ? data.subject || template?.subject : ""
    const bodyHtml = data.type === "EMAIL" ? data.bodyHtml || template?.bodyHtml : ""
    if (data.type === "EMAIL" && (!subject || !bodyHtml)) throw new Error("Renseignez un objet et un contenu, ou choisissez un modèle")
    const step = await prisma.emailSequenceStep.create({
      data: {
        sequenceId: sequence.id,
        position: (sequence.steps[0]?.position ?? -1) + 1,
        delayHours: data.delayHours,
        type: data.type,
        subject: subject || "",
        bodyHtml: bodyHtml || "",
        taskTitle: data.type === "EMAIL" ? null : data.taskTitle || null,
        taskNotes: data.type === "EMAIL" ? null : data.taskNotes || null,
        taskPriority: data.taskPriority,
        pauseUntilComplete: data.type === "EMAIL" ? false : data.pauseUntilComplete,
      },
    })
    await logAction({
      userId,
      action: "CREATE_EMAIL_SEQUENCE_STEP",
      resource: "EMAIL_SEQUENCE",
      resourceId: sequence.id,
      payload: { stepId: step.id, type: step.type, position: step.position },
    })
    revalidatePath("/dashboard/automatisations")
    return { success: true as const }
  }, "automation.write")
}

export async function deleteEmailSequenceStep(stepId: string) {
  return withAuth(async ({ companyId, userId }) => {
    const id = idSchema.parse(stepId)
    const step = await prisma.emailSequenceStep.findFirst({ where: { id, sequence: { companyId } }, select: { id: true, sequenceId: true, position: true } })
    if (!step) throw new Error("Étape introuvable")
    await unusedSequence(step.sequenceId, companyId)
    await prisma.$transaction(async (tx) => {
      await tx.emailSequenceStep.delete({ where: { id: step.id } })
      const following = await tx.emailSequenceStep.findMany({
        where: { sequenceId: step.sequenceId, position: { gt: step.position } },
        select: { id: true, position: true },
        orderBy: { position: "asc" },
      })
      for (const item of following) await tx.emailSequenceStep.update({ where: { id: item.id }, data: { position: item.position - 1 } })
    })
    await logAction({
      userId,
      action: "DELETE_EMAIL_SEQUENCE_STEP",
      resource: "EMAIL_SEQUENCE",
      resourceId: step.sequenceId,
      payload: { stepId: step.id, position: step.position },
    })
    revalidatePath("/dashboard/automatisations")
    return { success: true as const }
  }, "automation.write")
}

export async function moveEmailSequenceStep(stepId: string, direction: "UP" | "DOWN") {
  return withAuth(async ({ companyId, userId }) => {
    const id = idSchema.parse(stepId)
    const move = z.enum(["UP", "DOWN"]).parse(direction)
    const step = await prisma.emailSequenceStep.findFirst({ where: { id, sequence: { companyId } }, select: { id: true, sequenceId: true, position: true } })
    if (!step) throw new Error("Étape introuvable")
    await unusedSequence(step.sequenceId, companyId)
    const targetPosition = step.position + (move === "UP" ? -1 : 1)
    const target = await prisma.emailSequenceStep.findFirst({ where: { sequenceId: step.sequenceId, position: targetPosition }, select: { id: true, position: true } })
    if (!target) return { success: true as const }
    await prisma.$transaction(async (tx) => {
      await tx.emailSequenceStep.update({ where: { id: step.id }, data: { position: -1 } })
      await tx.emailSequenceStep.update({ where: { id: target.id }, data: { position: step.position } })
      await tx.emailSequenceStep.update({ where: { id: step.id }, data: { position: target.position } })
    })
    await logAction({ userId, action: "MOVE_EMAIL_SEQUENCE_STEP", resource: "EMAIL_SEQUENCE", resourceId: step.sequenceId, payload: { stepId: step.id, direction: move } })
    revalidatePath("/dashboard/automatisations")
    return { success: true as const }
  }, "automation.write")
}

export async function updateEmailSequenceStatus(sequenceId: string, status: string) {
  return withAuth(async ({ companyId, userId }) => {
    const id = idSchema.parse(sequenceId)
    const nextStatus = statusSchema.parse(status)
    const sequence = await prisma.emailSequence.findFirst({
      where: { id, companyId },
      include: { _count: { select: { steps: true, enrollments: { where: { status: { in: ["ACTIVE", "PAUSED"] } } } } } },
    })
    if (!sequence) throw new Error("Séquence introuvable")
    if (nextStatus === "ACTIVE" && sequence._count.steps === 0) throw new Error("Ajoutez une étape avant d'activer la séquence")
    if (nextStatus === "ARCHIVED" && sequence._count.enrollments > 0) throw new Error("Arrêtez les inscriptions actives ou en pause avant d’archiver la séquence")
    await prisma.emailSequence.update({ where: { id }, data: { status: nextStatus } })
    await logAction({ userId, action: "UPDATE_EMAIL_SEQUENCE_STATUS", resource: "EMAIL_SEQUENCE", resourceId: id, payload: { status: nextStatus } })
    revalidatePath("/dashboard/automatisations")
    return { success: true as const }
  }, "automation.write")
}

export async function updateEmailSequenceSettings(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = sequenceSettingsSchema.parse(input)
    const sequence = await prisma.emailSequence.findFirst({ where: { id: data.sequenceId, companyId }, select: { id: true } })
    if (!sequence) throw new Error("Séquence introuvable")
    await prisma.emailSequence.update({
      where: { id: sequence.id },
      data: { businessDaysOnly: data.businessDaysOnly, sendWindowStart: data.sendWindowStart, sendWindowEnd: data.sendWindowEnd, timezone: data.timezone },
    })
    await logAction({
      userId,
      action: "UPDATE_EMAIL_SEQUENCE_SETTINGS",
      resource: "EMAIL_SEQUENCE",
      resourceId: sequence.id,
      payload: { businessDaysOnly: data.businessDaysOnly, sendWindowStart: data.sendWindowStart, sendWindowEnd: data.sendWindowEnd, timezone: data.timezone },
    })
    revalidatePath("/dashboard/automatisations")
    return { success: true as const }
  }, "automation.write")
}

export async function enrollLeadInSequence(sequenceId: string, leadId: string) {
  return withAuth(async ({ companyId, userId }) => {
    const parsedSequenceId = idSchema.parse(sequenceId)
    const parsedLeadId = idSchema.parse(leadId)
    const enrollment = await enrollLeadInSequenceInternal({ companyId, sequenceId: parsedSequenceId, leadId: parsedLeadId })
    await logAction({
      userId,
      action: "ENROLL_EMAIL_SEQUENCE",
      resource: "EMAIL_SEQUENCE",
      resourceId: parsedSequenceId,
      payload: { leadId: parsedLeadId, enrollmentId: enrollment.id },
    })
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
    const enrollment = await prisma.emailSequenceEnrollment.findFirst({
      where: { id: idSchema.parse(enrollmentId), sequence: { companyId }, status: "ACTIVE" },
      select: { id: true },
    })
    if (!enrollment) throw new Error("Inscription active introuvable")
    await prisma.emailSequenceEnrollment.update({ where: { id: enrollment.id }, data: { status: "PAUSED", stopReason: "MANUAL_PAUSE" } })
    revalidatePath("/dashboard/automatisations")
    return { success: true as const }
  }, "automation.write")
}

export async function resumeSequenceEnrollment(enrollmentId: string) {
  return withAuth(async ({ companyId }) => {
    const enrollment = await prisma.emailSequenceEnrollment.findFirst({
      where: { id: idSchema.parse(enrollmentId), sequence: { companyId }, status: "PAUSED" },
      include: { sequence: { select: { businessDaysOnly: true, sendWindowStart: true, sendWindowEnd: true, timezone: true } } },
    })
    if (!enrollment) throw new Error("Inscription en pause introuvable")
    const nextSendAt = nextSequenceExecution(new Date(), 0, enrollment.sequence)
    await prisma.emailSequenceEnrollment.update({ where: { id: enrollment.id }, data: { status: "ACTIVE", stopReason: null, nextSendAt } })
    revalidatePath("/dashboard/automatisations")
    return { success: true as const }
  }, "automation.write")
}

export async function createAutomationWorkflow(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const parsed = workflowMutationSchema.parse(input)
    const configuration = workflowConfigurationSchema.parse({ conditions: parsed.conditions, actions: parsed.actions })
    assertWorkflowCompatibility(parsed.trigger, configuration)
    const workflow = await prisma.$transaction(async (tx) => {
      const workflow = await tx.automationWorkflow.create({
        data: { companyId, name: parsed.name, trigger: parsed.trigger, conditions: configuration.conditions || undefined, actions: configuration.actions },
      })
      await tx.automationWorkflowVersion.create({
        data: {
          companyId,
          workflowId: workflow.id,
          version: 1,
          status: "DRAFT",
          trigger: parsed.trigger,
          conditions: configuration.conditions || undefined,
          actions: configuration.actions,
        },
      })
      return workflow
    })
    await logAction({
      userId,
      action: "CREATE_AUTOMATION_WORKFLOW",
      resource: "AUTOMATION_WORKFLOW",
      resourceId: workflow.id,
      payload: { name: workflow.name, trigger: workflow.trigger },
    })
    revalidatePath("/dashboard/automatisations")
    return { success: true as const }
  }, "automation.write")
}

export async function updateAutomationWorkflow(workflowId: string, input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const id = idSchema.parse(workflowId)
    const parsed = workflowMutationSchema.parse(input)
    const configuration = workflowConfigurationSchema.parse({ conditions: parsed.conditions, actions: parsed.actions })
    assertWorkflowCompatibility(parsed.trigger, configuration)
    const workflow = await prisma.automationWorkflow.findFirst({
      where: { id, companyId, status: { not: "ARCHIVED" } },
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
    })
    if (!workflow) throw new Error("Automatisation introuvable")
    if (workflow.status === "ACTIVE") throw new Error("Mettez la règle en pause avant de la modifier")
    const version = (workflow.versions[0]?.version ?? 0) + 1
    await prisma.$transaction(async (tx) => {
      await tx.automationWorkflow.update({
        where: { id },
        data: { name: parsed.name, trigger: parsed.trigger, conditions: configuration.conditions || undefined, actions: configuration.actions, publishedVersion: null },
      })
      await tx.automationWorkflowVersion.create({
        data: { companyId, workflowId: id, version, status: "DRAFT", trigger: parsed.trigger, conditions: configuration.conditions || undefined, actions: configuration.actions },
      })
    })
    await logAction({
      userId,
      action: "UPDATE_AUTOMATION_WORKFLOW",
      resource: "AUTOMATION_WORKFLOW",
      resourceId: id,
      payload: { name: parsed.name, trigger: parsed.trigger, version },
    })
    revalidatePath("/dashboard/automatisations")
    return { success: true as const, version }
  }, "automation.write")
}

export async function duplicateAutomationWorkflow(workflowId: string) {
  return withAuth(async ({ companyId, userId }) => {
    const id = idSchema.parse(workflowId)
    const [source, names] = await Promise.all([
      prisma.automationWorkflow.findFirst({ where: { id, companyId, status: { not: "ARCHIVED" } } }),
      prisma.automationWorkflow.findMany({ where: { companyId }, select: { name: true } }),
    ])
    if (!source) throw new Error("Automatisation introuvable")
    const name = nextCopyName(
      source.name,
      names.map((item) => item.name),
    )
    const configuration = workflowConfigurationSchema.parse({ conditions: source.conditions ?? undefined, actions: source.actions })
    const copy = await prisma.$transaction(async (tx) => {
      const workflow = await tx.automationWorkflow.create({
        data: { companyId, name, trigger: source.trigger, conditions: configuration.conditions || undefined, actions: configuration.actions },
      })
      await tx.automationWorkflowVersion.create({
        data: {
          companyId,
          workflowId: workflow.id,
          version: 1,
          status: "DRAFT",
          trigger: source.trigger,
          conditions: configuration.conditions || undefined,
          actions: configuration.actions,
        },
      })
      return workflow
    })
    await logAction({ userId, action: "DUPLICATE_AUTOMATION_WORKFLOW", resource: "AUTOMATION_WORKFLOW", resourceId: copy.id, payload: { sourceId: source.id, name } })
    revalidatePath("/dashboard/automatisations")
    return { success: true as const, id: copy.id }
  }, "automation.write")
}

export async function updateAutomationWorkflowStatus(workflowId: string, status: string) {
  return withAuth(async ({ companyId, userId }) => {
    const id = idSchema.parse(workflowId)
    const workflow = await prisma.automationWorkflow.findFirst({ where: { id, companyId }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } })
    if (!workflow) throw new Error("Automatisation introuvable")
    const nextStatus = statusSchema.parse(status)
    if (nextStatus === "ACTIVE") {
      const configuration = workflowConfigurationSchema.parse({ conditions: workflow.conditions ?? undefined, actions: workflow.actions })
      await prisma.$transaction(async (tx) => {
        const latest = workflow.versions[0]
        const snapshot = JSON.stringify({ trigger: workflow.trigger, conditions: configuration.conditions || null, actions: configuration.actions })
        const latestSnapshot = latest ? JSON.stringify({ trigger: latest.trigger, conditions: latest.conditions || null, actions: latest.actions }) : null
        let publishedVersion = latest?.version ?? 1
        await tx.automationWorkflowVersion.updateMany({ where: { workflowId: workflow.id, status: "PUBLISHED" }, data: { status: "SUPERSEDED" } })
        if (latest && latestSnapshot === snapshot) {
          await tx.automationWorkflowVersion.update({ where: { id: latest.id }, data: { status: "PUBLISHED", publishedAt: latest.publishedAt || new Date() } })
        } else {
          publishedVersion = (latest?.version ?? 0) + 1
          await tx.automationWorkflowVersion.create({
            data: {
              companyId,
              workflowId: workflow.id,
              version: publishedVersion,
              status: "PUBLISHED",
              trigger: workflow.trigger,
              conditions: configuration.conditions || undefined,
              actions: configuration.actions,
              publishedAt: new Date(),
            },
          })
        }
        await tx.automationWorkflow.update({ where: { id }, data: { status: nextStatus, publishedVersion } })
      })
    } else {
      await prisma.automationWorkflow.update({ where: { id }, data: { status: nextStatus } })
    }
    await logAction({ userId, action: "UPDATE_AUTOMATION_WORKFLOW_STATUS", resource: "AUTOMATION_WORKFLOW", resourceId: id, payload: { status: nextStatus } })
    revalidatePath("/dashboard/automatisations")
    return { success: true as const }
  }, "automation.write")
}

export async function simulateAutomationWorkflow(workflowId: string, subjectId: string) {
  return withAuth(async ({ companyId }) => {
    const workflow = await prisma.automationWorkflow.findFirst({
      where: { id: idSchema.parse(workflowId), companyId },
      select: { id: true, name: true, trigger: true, conditions: true, actions: true },
    })
    if (!workflow) throw new Error("Workflow introuvable")
    const parsedSubjectId = idSchema.parse(subjectId)
    if (workflow.trigger === "CUSTOMER_HEALTH_CHANGED") {
      const client = await prisma.client.findFirst({
        where: { id: parsedSubjectId, companyId },
        select: { id: true, name: true, relationScore: true, healthSnapshots: { select: { score: true }, orderBy: { computedAt: "desc" }, take: 2 } },
      })
      if (!client) throw new Error("Client introuvable")
      const previousHealthScore = client.healthSnapshots[1]?.score ?? client.healthSnapshots[0]?.score ?? null
      const context = { clientName: client.name, healthScore: client.relationScore, previousHealthScore, healthStatus: customerHealthStatus(client.relationScore) }
      const evaluation = evaluateWorkflowConfiguration({ conditions: workflow.conditions ?? undefined, actions: workflow.actions }, null, context)
      return {
        success: true as const,
        workflow: workflow.name,
        lead: client.name,
        matches: evaluation.matches,
        trace: evaluation.trace,
        actions: evaluation.actions.map((action) => ({ type: action.type })),
      }
    }
    const lead = await prisma.leadCapture.findFirst({
      where: { id: parsedSubjectId, companyId },
      select: { id: true, clientId: true, firstName: true, lastName: true, email: true, projectType: true, city: true, source: true, status: true, marketingOptIn: true },
    })
    if (!lead) throw new Error("Prospect introuvable")
    const evaluation = evaluateWorkflowConfiguration({ conditions: workflow.conditions ?? undefined, actions: workflow.actions }, lead)
    return {
      success: true as const,
      workflow: workflow.name,
      lead: `${lead.firstName} ${lead.lastName}`,
      matches: evaluation.matches,
      trace: evaluation.trace,
      actions: evaluation.actions.map((action) => ({ type: action.type })),
    }
  }, "automation.read")
}

export async function processSequenceEmailsNow() {
  return withAuth(async ({ companyId, userId }) => {
    const rateLimit = await automationProcessRateLimit.limit(`${companyId}:${userId}`)
    if (!rateLimit.success) throw new Error("Trop de traitements manuels. Réessayez plus tard.")
    const summary = await processDueSequenceEmails(100, companyId)
    await logAction({ userId, action: "PROCESS_EMAIL_SEQUENCES", resource: "EMAIL_SEQUENCE", payload: summary })
    revalidatePath("/dashboard/automatisations")
    return { success: true as const, summary }
  }, "automation.write")
}
