import "server-only"
import { Prisma } from "@prisma/client"
import { z } from "zod"
import prisma from "@/lib/prisma"

const status = z.enum(["ALL", "RUNNING", "WAITING", "PAUSED", "COMPLETED", "SKIPPED", "FAILED", "DEAD_LETTER"])
const query = z.object({ page: z.number().int().min(1).max(1_000_000).default(1), search: z.string().trim().max(200).default(""), status: status.default("ALL") })
const stamp = (value: Date | null) => value?.toISOString() || null

export async function automationRunJournal(companyId: string, input: unknown = {}) {
  const data = query.parse(input)
  const where: Prisma.AutomationRunWhereInput = { companyId, ...(data.status !== "ALL" ? { status: data.status } : {}),
    ...(data.search ? { OR: [{ workflow: { name: { contains: data.search } } }, { event: { contains: data.search } }, { subjectModel: { contains: data.search } }] } : {}) }
  return prisma.$transaction(async tx => {
    const total = await tx.automationRun.count({ where }), pageCount = Math.max(1, Math.ceil(total / 25)), page = Math.min(data.page, pageCount)
    const rows = await tx.automationRun.findMany({ where, orderBy: [{ startedAt: "desc" }, { id: "desc" }], skip: (page - 1) * 25, take: 25,
      select: { id: true, event: true, subjectModel: true, status: true, startedAt: true, wakeAt: true, failures: true, workflowVersion: true, workflow: { select: { name: true, trigger: true } } } })
    return { rows: rows.map(({ workflow, ...row }) => ({ ...row, startedAt: row.startedAt.toISOString(), wakeAt: stamp(row.wakeAt), workflowName: workflow.name, trigger: workflow.trigger })), total, pageCount, page }
  })
}

function actionSummary(output: Prisma.JsonValue, state: string) {
  const record = output && typeof output === "object" && !Array.isArray(output) ? output : {}
  const type = typeof record.type === "string" && ["WAIT", "CREATE_TASK", "NOTIFY_TEAM", "UPDATE_LEAD_STATUS", "ENROLL_SEQUENCE"].includes(record.type) ? record.type : "HISTORICAL"
  if (state === "FAILED") return { type, summary: "Échec de cette action ; aucun résultat terminé n’est attesté par ce checkpoint." }
  if (state === "SKIPPED") return { type, summary: "Action interrompue par l’archivage du scénario." }
  if (type === "WAIT") return { type, summary: `Attente de ${typeof record.delayHours === "number" ? record.delayHours : "durée historique inconnue"} heure(s).` }
  if (state !== "COMPLETED") return { type, summary: "Résultat historique indisponible." }
  const summaries: Record<string, string> = { CREATE_TASK: "Tâche enregistrée.", ENROLL_SEQUENCE: "Inscription enregistrée.", UPDATE_LEAD_STATUS: "Modification du statut enregistrée.", NOTIFY_TEAM: "Notifications enregistrées.", HISTORICAL: "Checkpoint historique conservé." }
  return { type, summary: summaries[type] }
}

export async function automationRunDetails(companyId: string, input: unknown) {
  const runId = z.string().cuid().parse(input)
  const run = await prisma.automationRun.findFirst({ where: { id: runId, companyId }, select: { id: true, status: true, wakeAt: true, workflowVersion: true,
    workflow: { select: { name: true } }, checkpoints: { orderBy: { position: "asc" }, take: 51, select: { id: true, position: true, output: true, status: true, startedAt: true, completedAt: true, scheduledAt: true } } } })
  if (!run) return null
  // Valid configurations contain at most 50 flattened actions. An inconsistent
  // legacy journal is reported explicitly rather than silently truncated.
  const inconsistent = run.checkpoints.length > 50
  return { id: run.id, name: run.workflow.name, status: run.status, wakeAt: stamp(run.wakeAt), workflowVersion: run.workflowVersion, historicalUnavailable: !run.checkpoints.length, inconsistent,
    actions: inconsistent ? [] : run.checkpoints.map(({ output, ...row }) => ({ ...row, startedAt: stamp(row.startedAt), completedAt: stamp(row.completedAt), scheduledAt: stamp(row.scheduledAt), ...actionSummary(output, row.status) })) }
}
