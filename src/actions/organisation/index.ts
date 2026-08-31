"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import prisma from "@/lib/prisma"
import { withAuth } from "@/lib/auth-wrapper"
import { advanceTaskRecurrence } from "@/lib/workflow-rules"
import { completeSequenceTaskFromOrganisationTask } from "@/lib/automations/sequences"

const TASK_STATUSES = ["TODO", "IN_PROGRESS", "DONE", "BLOCKED"] as const
const GOAL_SCOPES = ["DAY", "WEEK", "MONTH", "YEAR"] as const
const TASK_CATEGORIES = ["DEV", "ADMIN", "SALES", "SUPPORT", "LEARNING"] as const

const goalSchema = z.object({
  title: z.string().trim().min(1, "Titre requis").max(180),
  description: z.string().trim().max(2000).optional().nullable(),
  scope: z.enum(GOAL_SCOPES).default("WEEK"),
  status: z.enum(TASK_STATUSES).default("TODO"),
  priority: z.coerce.number().int().min(1).max(3).default(2),
  periodStart: z.string().optional().nullable(),
  periodEnd: z.string().optional().nullable(),
})

const taskSchema = z.object({
  title: z.string().trim().min(1, "Titre requis").max(180),
  notes: z.string().trim().max(2000).optional().nullable(),
  status: z.enum(TASK_STATUSES).default("TODO"),
  priority: z.coerce.number().int().min(1).max(3).default(2),
  category: z.enum(TASK_CATEGORIES).default("DEV"),
  estimateMin: z.coerce
    .number()
    .int()
    .min(0)
    .max(24 * 60)
    .optional()
    .nullable(),
  isBillable: z.boolean().optional(),
  dueDate: z.string().optional().nullable(),
  scheduledDate: z.string().optional().nullable(),
  clientId: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
  goalId: z.string().optional().nullable(),
  recurrence: z.enum(["DAILY", "WEEKLY", "MONTHLY"]).optional().nullable(),
  recurrenceInterval: z.coerce.number().int().min(1).max(52).optional(),
  recurrenceEnd: z.string().optional().nullable(),
})

type TaskInput = z.input<typeof taskSchema>
type GoalInput = z.input<typeof goalSchema>

const HOURLY_RATE_CENTS = 6250

function toIso(value: Date | null | undefined) {
  return value ? value.toISOString() : null
}

function parseDate(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function cleanId(value: string | null | undefined) {
  return value && value.trim() !== "" ? value : null
}

function startOfDay(date = new Date()) {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  return result
}

function endOfDay(date = new Date()) {
  const result = startOfDay(date)
  result.setDate(result.getDate() + 1)
  return result
}

function startOfWeek(date = new Date()) {
  const result = startOfDay(date)
  const day = result.getDay()
  const diff = result.getDate() - day + (day === 0 ? -6 : 1)
  result.setDate(diff)
  return result
}

function addDays(date: Date, days: number) {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

function startOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function endOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1)
}

function startOfYear(date = new Date()) {
  return new Date(date.getFullYear(), 0, 1)
}

function endOfYear(date = new Date()) {
  return new Date(date.getFullYear() + 1, 0, 1)
}

async function recomputeProjectConsumed(projectId: string) {
  const sum = await prisma.timeEntry.aggregate({
    where: { projectId, isBillable: true },
    _sum: { durationSec: true },
  })
  const seconds = sum._sum.durationSec ?? 0
  const consumedCents = Math.round((seconds / 3600) * HOURLY_RATE_CENTS)
  await prisma.project.update({
    where: { id: projectId },
    data: { consumedCents },
  })
}

async function resolveTaskRelations(companyId: string, data: z.output<typeof taskSchema>) {
  const projectId = cleanId(data.projectId)
  let clientId = cleanId(data.clientId)
  const goalId = cleanId(data.goalId)

  if (projectId) {
    const project = await prisma.project.findFirst({
      where: { id: projectId, companyId },
      select: { id: true, clientId: true },
    })
    if (!project) throw new Error("Projet introuvable")
    clientId = clientId ?? project.clientId
  }

  if (clientId) {
    const client = await prisma.client.findFirst({
      where: { id: clientId, companyId },
      select: { id: true },
    })
    if (!client) throw new Error("Client introuvable")
  }

  if (goalId) {
    const goal = await prisma.organisationGoal.findFirst({
      where: { id: goalId, companyId },
      select: { id: true },
    })
    if (!goal) throw new Error("Objectif introuvable")
  }

  return { projectId, clientId, goalId }
}

function revalidateOrganisation(paths: string[] = []) {
  revalidatePath("/dashboard")
  revalidatePath("/dashboard/organisation")
  for (const path of paths) revalidatePath(path)
}

export async function getOrganisationDashboardData() {
  return await withAuth(async ({ companyId }) => {
    const now = new Date()
    const todayStart = startOfDay(now)
    const tomorrowStart = endOfDay(now)
    const weekStart = startOfWeek(now)
    const weekEnd = addDays(weekStart, 7)
    const monthStart = startOfMonth(now)
    const monthEnd = endOfMonth(now)
    const yearStart = startOfYear(now)
    const yearEnd = endOfYear(now)

    const [goals, tasks, projects, clients, weekTimeEntries, invoices, quotes, milestones] = await Promise.all([
      prisma.organisationGoal.findMany({
        where: {
          companyId,
          OR: [{ status: { not: "DONE" } }, { updatedAt: { gte: weekStart } }, { periodStart: { gte: yearStart, lt: yearEnd } }],
        },
        include: {
          tasks: {
            select: { id: true, status: true },
          },
        },
        orderBy: [{ status: "asc" }, { priority: "asc" }, { periodStart: "asc" }],
        take: 80,
      }),
      prisma.organisationTask.findMany({
        where: {
          companyId,
          OR: [{ status: { not: "DONE" } }, { updatedAt: { gte: weekStart } }, { dueDate: { gte: monthStart, lt: monthEnd } }, { scheduledDate: { gte: weekStart, lt: weekEnd } }],
        },
        include: {
          client: { select: { id: true, name: true } },
          project: { select: { id: true, name: true, client: { select: { id: true, name: true } } } },
          goal: { select: { id: true, title: true, scope: true } },
        },
        orderBy: [{ status: "asc" }, { priority: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
        take: 160,
      }),
      prisma.project.findMany({
        where: { companyId, status: { not: "ARCHIVED" } },
        select: {
          id: true,
          name: true,
          status: true,
          budgetCents: true,
          consumedCents: true,
          endDate: true,
          client: { select: { id: true, name: true } },
        },
        orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
        take: 80,
      }),
      prisma.client.findMany({
        where: { companyId },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
        take: 100,
      }),
      prisma.timeEntry.findMany({
        where: {
          project: { companyId },
          date: { gte: weekStart, lt: weekEnd },
        },
        include: {
          project: { select: { id: true, name: true, client: { select: { id: true, name: true } } } },
        },
        orderBy: { date: "desc" },
        take: 5_000,
      }),
      prisma.invoice.findMany({
        where: {
          companyId,
          status: { in: ["DRAFT", "SENT", "OVERDUE"] },
        },
        include: { client: { select: { id: true, name: true } } },
        orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
        take: 12,
      }),
      prisma.quote.findMany({
        where: {
          companyId,
          status: { in: ["DRAFT", "SENT"] },
        },
        include: {
          client: { select: { id: true, name: true } },
          versions: {
            orderBy: { version: "desc" },
            take: 1,
            select: { totalTtcCents: true },
          },
        },
        orderBy: [{ validUntil: "asc" }, { createdAt: "desc" }],
        take: 12,
      }),
      prisma.projectMilestone.findMany({
        where: {
          project: { companyId },
          status: { not: "DONE" },
          dueDate: { gte: todayStart, lt: monthEnd },
        },
        include: {
          project: { select: { id: true, name: true, client: { select: { id: true, name: true } } } },
        },
        orderBy: { dueDate: "asc" },
        take: 12,
      }),
    ])

    return {
      generatedAt: now.toISOString(),
      periods: {
        todayStart: todayStart.toISOString(),
        tomorrowStart: tomorrowStart.toISOString(),
        weekStart: weekStart.toISOString(),
        weekEnd: weekEnd.toISOString(),
        monthStart: monthStart.toISOString(),
        monthEnd: monthEnd.toISOString(),
        yearStart: yearStart.toISOString(),
        yearEnd: yearEnd.toISOString(),
      },
      goals: goals.map((goal) => ({
        id: goal.id,
        title: goal.title,
        description: goal.description,
        scope: goal.scope,
        status: goal.status,
        priority: goal.priority,
        periodStart: toIso(goal.periodStart),
        periodEnd: toIso(goal.periodEnd),
        createdAt: goal.createdAt.toISOString(),
        updatedAt: goal.updatedAt.toISOString(),
        taskCount: goal.tasks.length,
        doneTaskCount: goal.tasks.filter((task) => task.status === "DONE").length,
      })),
      tasks: tasks.map((task) => ({
        id: task.id,
        title: task.title,
        notes: task.notes,
        status: task.status,
        priority: task.priority,
        category: task.category,
        estimateMin: task.estimateMin,
        isBillable: task.isBillable,
        dueDate: toIso(task.dueDate),
        scheduledDate: toIso(task.scheduledDate),
        createdAt: task.createdAt.toISOString(),
        updatedAt: task.updatedAt.toISOString(),
        client: task.client ? { id: task.client.id, name: task.client.name } : null,
        project: task.project
          ? {
              id: task.project.id,
              name: task.project.name,
              client: task.project.client,
            }
          : null,
        goal: task.goal,
        recurrence: task.recurrence,
        recurrenceInterval: task.recurrenceInterval,
        recurrenceEnd: toIso(task.recurrenceEnd),
      })),
      projects: projects.map((project) => ({
        id: project.id,
        name: project.name,
        status: project.status,
        budgetCents: project.budgetCents,
        consumedCents: project.consumedCents,
        endDate: toIso(project.endDate),
        client: project.client,
      })),
      clients,
      weekTimeEntries: weekTimeEntries.map((entry) => ({
        id: entry.id,
        date: entry.date.toISOString(),
        durationSec: entry.durationSec,
        isBillable: entry.isBillable,
        project: entry.project,
      })),
      watchlist: {
        invoices: invoices.map((invoice) => ({
          id: invoice.id,
          number: invoice.number,
          object: invoice.object,
          status: invoice.status,
          dueDate: invoice.dueDate.toISOString(),
          totalTtcCents: invoice.totalTtcCents,
          paidAmountCents: invoice.paidAmountCents,
          client: invoice.client,
        })),
        quotes: quotes.map((quote) => ({
          id: quote.id,
          number: quote.number,
          object: quote.object,
          status: quote.status,
          validUntil: toIso(quote.validUntil),
          totalTtcCents: quote.versions[0]?.totalTtcCents ?? 0,
          client: quote.client,
        })),
        milestones: milestones.map((milestone) => ({
          id: milestone.id,
          title: milestone.title,
          status: milestone.status,
          dueDate: toIso(milestone.dueDate),
          project: milestone.project,
        })),
      },
    }
  })
}

export async function createOrganisationGoal(data: GoalInput) {
  return await withAuth(async ({ companyId }) => {
    const validated = goalSchema.parse(data)
    const goal = await prisma.organisationGoal.create({
      data: {
        companyId,
        title: validated.title,
        description: validated.description || null,
        scope: validated.scope,
        status: validated.status,
        priority: validated.priority,
        periodStart: parseDate(validated.periodStart),
        periodEnd: parseDate(validated.periodEnd),
      },
    })
    revalidateOrganisation()
    return goal
  })
}

export async function updateOrganisationGoalStatus(id: string, status: (typeof TASK_STATUSES)[number]) {
  return await withAuth(async ({ companyId }) => {
    const existing = await prisma.organisationGoal.findFirst({ where: { id, companyId } })
    if (!existing) throw new Error("Objectif introuvable")

    const goal = await prisma.organisationGoal.update({
      where: { id },
      data: { status },
    })
    revalidateOrganisation()
    return goal
  })
}

export async function deleteOrganisationGoal(id: string) {
  return await withAuth(async ({ companyId }) => {
    const existing = await prisma.organisationGoal.findFirst({ where: { id, companyId } })
    if (!existing) throw new Error("Objectif introuvable")

    await prisma.organisationTask.updateMany({
      where: { goalId: id, companyId },
      data: { goalId: null },
    })
    await prisma.organisationGoal.delete({ where: { id } })
    revalidateOrganisation()
    return { ok: true }
  })
}

export async function createOrganisationTask(data: TaskInput) {
  return await withAuth(async ({ companyId }) => {
    const validated = taskSchema.parse(data)
    const relations = await resolveTaskRelations(companyId, validated)

    const task = await prisma.organisationTask.create({
      data: {
        companyId,
        title: validated.title,
        notes: validated.notes || null,
        status: validated.status,
        priority: validated.priority,
        category: validated.category,
        estimateMin: validated.estimateMin || null,
        isBillable: validated.isBillable ?? true,
        dueDate: parseDate(validated.dueDate),
        scheduledDate: parseDate(validated.scheduledDate),
        clientId: relations.clientId,
        projectId: relations.projectId,
        goalId: relations.goalId,
        recurrence: validated.recurrence || null,
        recurrenceInterval: validated.recurrenceInterval ?? 1,
        recurrenceEnd: parseDate(validated.recurrenceEnd),
      },
    })
    revalidateOrganisation()
    return task
  })
}

export async function updateOrganisationTaskStatus(id: string, status: (typeof TASK_STATUSES)[number]) {
  return await withAuth(async ({ companyId }) => {
    const existing = await prisma.organisationTask.findFirst({ where: { id, companyId } })
    if (!existing) throw new Error("Tache introuvable")

    const task = await prisma.$transaction(async (tx) => {
      const updated = await tx.organisationTask.update({ where: { id }, data: { status } })
      if (status === "DONE" && existing.recurrence) {
        const alreadyCreated = await tx.organisationTask.findFirst({
          where: { companyId, recurrenceSourceId: id },
          select: { id: true },
        })
        const interval = existing.recurrenceInterval || 1
        const nextScheduled = advanceTaskRecurrence(existing.scheduledDate, existing.recurrence, interval)
        const nextDue = advanceTaskRecurrence(existing.dueDate, existing.recurrence, interval)
        const nextDate = nextScheduled ?? nextDue
        const withinEnd = !existing.recurrenceEnd || !nextDate || nextDate <= existing.recurrenceEnd
        if (!alreadyCreated && withinEnd) {
          await tx.organisationTask.create({
            data: {
              companyId,
              title: existing.title,
              notes: existing.notes,
              status: "TODO",
              priority: existing.priority,
              category: existing.category,
              estimateMin: existing.estimateMin,
              isBillable: existing.isBillable,
              dueDate: nextDue,
              scheduledDate: nextScheduled,
              clientId: existing.clientId,
              projectId: existing.projectId,
              goalId: existing.goalId,
              recurrence: existing.recurrence,
              recurrenceInterval: interval,
              recurrenceEnd: existing.recurrenceEnd,
              recurrenceSourceId: id,
            },
          })
        }
      }
      return updated
    })
    if (status === "DONE") await completeSequenceTaskFromOrganisationTask(task.id)
    revalidateOrganisation()
    revalidatePath("/dashboard/automatisations")
    return task
  })
}

export async function deleteOrganisationTask(id: string) {
  return await withAuth(async ({ companyId }) => {
    const existing = await prisma.organisationTask.findFirst({ where: { id, companyId } })
    if (!existing) throw new Error("Tache introuvable")

    await prisma.organisationTask.delete({ where: { id } })
    revalidateOrganisation()
    return { ok: true }
  })
}

export async function createTimeEntryFromOrganisationTask(id: string, durationMin?: number) {
  return await withAuth(async ({ companyId }) => {
    const task = await prisma.organisationTask.findFirst({
      where: { id, companyId },
      include: { project: { select: { id: true, companyId: true } } },
    })
    if (!task) throw new Error("Tache introuvable")
    if (!task.projectId || !task.project) {
      throw new Error("Associez cette tache a un projet avant d'imputer du temps.")
    }

    const minutes = Math.max(1, Math.min(durationMin ?? task.estimateMin ?? 60, 24 * 60))
    await prisma.timeEntry.create({
      data: {
        projectId: task.projectId,
        durationSec: minutes * 60,
        description: task.title,
        date: task.scheduledDate ?? task.dueDate ?? new Date(),
        isBillable: task.isBillable,
      },
    })
    await prisma.organisationTask.update({
      where: { id },
      data: { status: "DONE" },
    })
    await recomputeProjectConsumed(task.projectId)
    revalidateOrganisation(["/dashboard/temps", "/dashboard/projets", `/dashboard/projets/${task.projectId}`])
    return { ok: true }
  })
}
