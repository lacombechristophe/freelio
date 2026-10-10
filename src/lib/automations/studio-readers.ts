import "server-only"
import { Prisma } from "@prisma/client"
import { z } from "zod"
import prisma, { type TransactionClient } from "@/lib/prisma"
import { getContext } from "@/lib/context"

const pageQuery = z.object({ page: z.number().int().min(1).max(1_000_000).default(1), search: z.string().trim().max(200).default(""), selectedId: z.string().cuid().optional() })
const statusQuery = pageQuery.extend({ status: z.enum(["ALL", "DRAFT", "ACTIVE", "PAUSED"]).default("ALL") })
const contains = (search: string) => ({ contains: search, ...(process.env.DATABASE_URL?.startsWith("postgres") ? { mode: "insensitive" as const } : {}) })
const pagination = (total: number, requested: number) => { const pageCount = Math.max(1, Math.ceil(total / 25)); return { total, page: Math.min(requested, pageCount), pageCount } }
const windowArgs = (page: number) => ({ skip: (page - 1) * 25, take: 25 })

export async function sequenceMailboxWhere(companyId: string, db: typeof prisma | TransactionClient = prisma): Promise<Prisma.EmailSequenceWhereInput> {
  const context = getContext()
  if (!context || ["OWNER", "ADMIN"].includes(context.role)) return { companyId }
  const channels = await db.communicationChannel.findMany({ where: { companyId }, select: { id: true } })
  return { companyId, OR: [{ senderChannelId: null }, { senderChannelId: { in: channels.map(row => row.id) } }] }
}

const templateSelect = { id: true, name: true, category: true, subject: true, bodyHtml: true, status: true, updatedAt: true } as const satisfies Prisma.EmailTemplateSelect
export async function readTemplateStudio(companyId: string, input: unknown = {}) {
  const query = pageQuery.extend({ category: z.string().max(50).default("ALL") }).parse(input)
  const eligible = { companyId, status: "ACTIVE" }
  const where: Prisma.EmailTemplateWhereInput = { ...eligible, ...(query.category !== "ALL" ? { category: query.category } : {}), ...(query.search ? { OR: [{ name: contains(query.search) }, { subject: contains(query.search) }] } : {}) }
  return prisma.$transaction(async tx => {
    const page = pagination(await tx.emailTemplate.count({ where }), query.page)
    const rows = await tx.emailTemplate.findMany({ where, select: templateSelect, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], ...windowArgs(page.page) })
    const selected = query.selectedId ? await tx.emailTemplate.findFirst({ where: { ...eligible, id: query.selectedId }, select: templateSelect }) : null
    const dto = (row: (typeof rows)[number]) => ({ ...row, updatedAt: row.updatedAt.toISOString() })
    return { ...page, rows: rows.map(dto), selected: selected ? dto(selected) : null }
  }, { isolationLevel: "Serializable" })
}

const enrollmentInclude = {
  leadCapture: { select: { firstName: true, lastName: true, email: true } },
  taskExecutions: {
    orderBy: { createdAt: "desc" },
    select: { completedAt: true, organisationTaskId: true, step: { select: { taskTitle: true, type: true } } },
  },
} as const satisfies Prisma.EmailSequenceEnrollmentInclude
type Enrollment = Prisma.EmailSequenceEnrollmentGetPayload<{ include: typeof enrollmentInclude }>
export async function readEnrollmentTasks(db: typeof prisma | TransactionClient, enrollments: Array<{ taskExecutions: Array<{ organisationTaskId: string }> }>) {
  const ids = Array.from(new Set(enrollments.flatMap(row => row.taskExecutions.map(task => task.organisationTaskId))))
  // A required to-one Prisma include cannot take a mailbox where filter.
  // Fetch through the protected model and omit inaccessible calendar tasks.
  const tasks = await db.organisationTask.findMany({ where: { id: { in: ids } }, select: { id: true, status: true, title: true } })
  return new Map(tasks.map(task => [task.id, task]))
}
const enrollmentDto = (row: Enrollment, tasks: Awaited<ReturnType<typeof readEnrollmentTasks>>) => ({ id: row.id, status: row.status, nextStepPosition: row.nextStepPosition, nextSendAt: row.nextSendAt?.toISOString() ?? null, lastSentAt: row.lastSentAt?.toISOString() ?? null,
  stopReason: row.stopReason, enrolledAt: row.enrolledAt.toISOString(), completedAt: row.completedAt?.toISOString() ?? null, leadCapture: row.leadCapture,
  taskExecutions: row.taskExecutions.flatMap(execution => { const task = tasks.get(execution.organisationTaskId); return task ? [{ completedAt: execution.completedAt?.toISOString() ?? null, step: execution.step, organisationTask: task }] : [] }) })
const sequenceInclude = { steps: { orderBy: { position: "asc" } }, enrollments: { orderBy: [{ enrolledAt: "desc" }, { id: "desc" }], take: 25, include: enrollmentInclude }, _count: { select: { enrollments: true, deliveries: true } } } as const satisfies Prisma.EmailSequenceInclude

export async function readSequenceStudio(companyId: string, input: unknown = {}) {
  const query = statusQuery.parse(input)
  return prisma.$transaction(async tx => {
    const eligible: Prisma.EmailSequenceWhereInput = { AND: [await sequenceMailboxWhere(companyId, tx), { status: { not: "ARCHIVED" } }] }
    const where: Prisma.EmailSequenceWhereInput = { AND: [eligible, ...(query.status !== "ALL" ? [{ status: query.status }] : []), ...(query.search ? [{ OR: [{ name: contains(query.search) }, { description: contains(query.search) }] }] : [])] }
    const page = pagination(await tx.emailSequence.count({ where }), query.page)
    const rows = await tx.emailSequence.findMany({ where, include: sequenceInclude, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], ...windowArgs(page.page) })
    const selected = query.selectedId ? await tx.emailSequence.findFirst({ where: { AND: [eligible, { id: query.selectedId }] }, include: sequenceInclude }) : null
    const tasks = await readEnrollmentTasks(tx, [...rows.flatMap(row => row.enrollments), ...(selected?.enrollments || [])])
    const ids = Array.from(new Set([...rows.map(row => row.id), ...(selected ? [selected.id] : [])]))
    const deliveries = await tx.emailDelivery.groupBy({ where: { companyId, sequenceId: { in: ids }, stepId: { not: null } }, by: ["stepId", "status"], _count: { _all: true } })
    const active = await tx.emailSequenceEnrollment.groupBy({ where: { sequenceId: { in: ids }, status: "ACTIVE", sequence: { companyId } }, by: ["sequenceId"], _count: { _all: true } })
    const activeCounts = new Map(active.map(row => [row.sequenceId, row._count._all]))
    const stats = new Map<string, Record<string, number>>()
    for (const row of deliveries) if (row.stepId) { const step = stats.get(row.stepId) || {}; step[row.status] = row._count._all; stats.set(row.stepId, step) }
    const dto = (row: (typeof rows)[number]) => ({ id: row.id, name: row.name, description: row.description, status: row.status, businessDaysOnly: row.businessDaysOnly, sendWindowStart: row.sendWindowStart, sendWindowEnd: row.sendWindowEnd,
      timezone: row.timezone, senderChannelId: row.senderChannelId, updatedAt: row.updatedAt.toISOString(), _count: row._count, activeEnrollmentCount: activeCounts.get(row.id) || 0,
      steps: row.steps.map(step => ({ id: step.id, position: step.position, delayHours: step.delayHours, type: step.type, subject: step.subject, bodyHtml: step.bodyHtml, taskTitle: step.taskTitle, taskNotes: step.taskNotes, taskPriority: step.taskPriority, pauseUntilComplete: step.pauseUntilComplete, deliveryStats: stats.get(step.id) || {} })),
      enrollments: row.enrollments.map(enrollment => enrollmentDto(enrollment, tasks)) })
    return { ...page, rows: rows.map(dto), selected: selected ? dto(selected) : null }
  }, { isolationLevel: "Serializable" })
}

const workflowInclude = { runs: { orderBy: [{ startedAt: "desc" }, { id: "desc" }], take: 5 }, versions: { orderBy: { version: "desc" }, take: 5 } } as const satisfies Prisma.AutomationWorkflowInclude
export async function readWorkflowStudio(companyId: string, input: unknown = {}) {
  const query = statusQuery.parse(input), eligible = { companyId, status: { not: "ARCHIVED" } }
  const where: Prisma.AutomationWorkflowWhereInput = { ...eligible, ...(query.status !== "ALL" ? { status: query.status } : {}), ...(query.search ? { name: contains(query.search) } : {}) }
  return prisma.$transaction(async tx => {
    const page = pagination(await tx.automationWorkflow.count({ where }), query.page)
    const rows = await tx.automationWorkflow.findMany({ where, include: workflowInclude, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], ...windowArgs(page.page) })
    const selected = query.selectedId ? await tx.automationWorkflow.findFirst({ where: { ...eligible, id: query.selectedId }, include: workflowInclude }) : null
    const dto = (row: (typeof rows)[number]) => ({ id: row.id, name: row.name, trigger: row.trigger, status: row.status, conditions: row.conditions, actions: row.actions, publishedVersion: row.publishedVersion, updatedAt: row.updatedAt.toISOString(),
      runs: row.runs.map(run => ({ id: run.id, event: run.event, subjectModel: run.subjectModel, subjectId: run.subjectId, status: run.status, output: run.output, error: run.error, startedAt: run.startedAt.toISOString(), completedAt: run.completedAt?.toISOString() ?? null })),
      versions: row.versions.map(version => ({ id: version.id, version: version.version, status: version.status, trigger: version.trigger, publishedAt: version.publishedAt?.toISOString() ?? null, createdAt: version.createdAt.toISOString() })) })
    return { ...page, rows: rows.map(dto), selected: selected ? dto(selected) : null }
  }, { isolationLevel: "Serializable" })
}

export async function readSequenceEnrollments(companyId: string, input: unknown) {
  const query = pageQuery.extend({ sequenceId: z.string().cuid(), status: z.enum(["ALL", "ACTIVE", "PAUSED", "STOPPED", "COMPLETED"]).default("ALL") }).parse(input)
  return prisma.$transaction(async tx => {
    const sequence = await tx.emailSequence.findFirst({ where: { AND: [await sequenceMailboxWhere(companyId, tx), { id: query.sequenceId }] }, select: { id: true } })
    if (!sequence) return null
    const where: Prisma.EmailSequenceEnrollmentWhereInput = { sequenceId: sequence.id, sequence: { companyId }, ...(query.status !== "ALL" ? { status: query.status } : {}), ...(query.search ? { leadCapture: { OR: [{ firstName: contains(query.search) }, { lastName: contains(query.search) }, { email: contains(query.search) }] } } : {}) }
    const page = pagination(await tx.emailSequenceEnrollment.count({ where }), query.page)
    const rows = await tx.emailSequenceEnrollment.findMany({ where, include: enrollmentInclude, orderBy: [{ enrolledAt: "desc" }, { id: "desc" }], ...windowArgs(page.page) })
    const tasks = await readEnrollmentTasks(tx, rows)
    return { ...page, rows: rows.map(row => enrollmentDto(row, tasks)) }
  }, { isolationLevel: "Serializable" })
}

export async function readEmailSuppressions(companyId: string, input: unknown = {}) {
  const query = pageQuery.parse(input)
  const where: Prisma.EmailSuppressionWhereInput = { companyId, active: true, ...(query.search ? { email: contains(query.search) } : {}) }
  return prisma.$transaction(async tx => {
    const page = pagination(await tx.emailSuppression.count({ where }), query.page)
    const rows = await tx.emailSuppression.findMany({ where, select: { id: true, email: true, reason: true, provider: true, suppressedAt: true }, orderBy: [{ suppressedAt: "desc" }, { id: "desc" }], ...windowArgs(page.page) })
    return { ...page, rows: rows.map(row => ({ ...row, suppressedAt: row.suppressedAt.toISOString() })) }
  }, { isolationLevel: "Serializable" })
}
