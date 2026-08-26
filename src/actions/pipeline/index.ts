"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { withAuth } from "@/lib/auth-wrapper"
import { logAction } from "@/lib/audit"
import { resolveOpportunityStage } from "@/lib/pipeline-rules"
import prisma from "@/lib/prisma"

const DEFAULT_STAGES = [
  { id: "PROSPECT", title: "Prospect" },
  { id: "CONTACTED", title: "Contact pris" },
  { id: "QUALIFIED", title: "Besoin qualifié" },
  { id: "SENT", title: "Devis envoyé" },
  { id: "WON", title: "Gagné" },
]

const id = z.string().cuid()
const optionalId = z.union([id, z.literal(""), z.null()]).optional().transform((value) => value || null)
const optionalDate = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(""), z.null()]).optional().transform((value) => value || null)
const opportunitySchema = z.object({
  title: z.string().trim().min(2, "Le titre est requis").max(180),
  clientId: id,
  status: z.string().trim().min(1).max(64),
  valueCents: z.coerce.number().int().min(0).max(2_000_000_000),
  probability: z.coerce.number().int().min(0).max(100),
  ownerMembershipId: optionalId,
  closeDate: optionalDate,
  lostReason: z.string().trim().max(500).optional().nullable(),
})

const activitySchema = z.object({
  type: z.enum(["EMAIL", "CALL", "MEETING", "NOTE"]),
  content: z.string().trim().min(2, "Le compte rendu est requis").max(5_000),
})

function pipelineStages(value: unknown) {
  if (!Array.isArray(value)) return DEFAULT_STAGES
  const parsed = z.array(z.object({ id: z.string().min(1).max(64), title: z.string().min(1).max(120) })).safeParse(value)
  return parsed.success ? parsed.data : DEFAULT_STAGES
}

function assertAllowedStatus(stages: Array<{ id: string }>, status: string) {
  if (status !== "LOST" && !stages.some((stage) => stage.id === status)) throw new Error("Étape commerciale invalide")
}

function dateFromInput(value: string | null) {
  return value ? new Date(`${value}T12:00:00.000Z`) : null
}

async function ensurePipeline(companyId: string) {
  const existing = await prisma.pipeline.findUnique({ where: { companyId } })
  if (existing) return existing
  return prisma.pipeline.create({ data: { companyId, name: "Pipeline Commercial", stages: DEFAULT_STAGES } })
}

async function assertReferences(companyId: string, clientId: string, ownerMembershipId: string | null) {
  const [client, owner] = await Promise.all([
    prisma.client.findFirst({ where: { id: clientId, companyId }, select: { id: true } }),
    ownerMembershipId
      ? prisma.membership.findFirst({ where: { id: ownerMembershipId, companyId, status: "ACTIVE", role: { in: ["OWNER", "ADMIN", "SALES"] } }, select: { id: true } })
      : null,
  ])
  if (!client) throw new Error("Client introuvable")
  if (ownerMembershipId && !owner) throw new Error("Responsable commercial introuvable")
}

export async function getPipeline() {
  return withAuth(async ({ companyId }) => {
    const [pipeline, members] = await Promise.all([
      prisma.pipeline.findUnique({
        where: { companyId },
        include: {
          opportunities: {
            include: {
              client: { select: { id: true, name: true } },
              ownerMembership: { include: { user: { select: { name: true, email: true } } } },
            },
            orderBy: { updatedAt: "desc" },
          },
        },
      }),
      prisma.membership.findMany({
        where: { companyId, status: "ACTIVE", role: { in: ["OWNER", "ADMIN", "SALES"] } },
        include: { user: { select: { name: true, email: true } } },
        orderBy: { createdAt: "asc" },
      }),
    ])

    return {
      id: pipeline?.id ?? null,
      stages: pipelineStages(pipeline?.stages),
      members: members.map((member) => ({ id: member.id, name: member.user.name || member.user.email || "Commercial" })),
      opportunities: (pipeline?.opportunities ?? []).map((opportunity) => ({
        id: opportunity.id,
        title: opportunity.title,
        status: opportunity.status,
        valueCents: opportunity.valueCents,
        probability: opportunity.probability,
        clientId: opportunity.clientId,
        client: opportunity.client,
        closeDate: opportunity.closeDate?.toISOString().slice(0, 10) ?? null,
        closedAt: opportunity.closedAt?.toISOString() ?? null,
        lostReason: opportunity.lostReason,
        ownerMembershipId: opportunity.ownerMembershipId,
        ownerName: opportunity.ownerMembership?.user.name || opportunity.ownerMembership?.user.email || opportunity.ownerLabel || null,
        createdAt: opportunity.createdAt.toISOString(),
      })),
    }
  }, "sales.read")
}

export async function getOpportunityDetail(opportunityId: string) {
  return withAuth(async ({ companyId }) => {
    const parsedId = id.safeParse(opportunityId)
    if (!parsedId.success) return null
    const [opportunity, members] = await Promise.all([
      prisma.opportunity.findFirst({
        where: { id: parsedId.data, pipeline: { companyId } },
        include: {
          pipeline: { select: { stages: true } },
          client: {
            include: {
              contacts: { orderBy: [{ isPrimary: "desc" }, { lastName: "asc" }] },
              quotes: {
                include: { versions: { orderBy: { version: "desc" }, take: 1 } },
                orderBy: { updatedAt: "desc" },
                take: 10,
              },
              projects: { orderBy: { updatedAt: "desc" }, take: 10 },
              activities: { orderBy: { happenedAt: "desc" }, take: 10 },
            },
          },
          ownerMembership: { include: { user: { select: { name: true, email: true } } } },
          activities: { orderBy: { createdAt: "desc" }, take: 100 },
          leadCaptures: { orderBy: { createdAt: "desc" }, take: 20 },
        },
      }),
      prisma.membership.findMany({
        where: { companyId, status: "ACTIVE", role: { in: ["OWNER", "ADMIN", "SALES"] } },
        include: { user: { select: { name: true, email: true } } },
        orderBy: { createdAt: "asc" },
      }),
    ])
    if (!opportunity) return null
    return {
      ...opportunity,
      closeDate: opportunity.closeDate?.toISOString().slice(0, 10) ?? null,
      closedAt: opportunity.closedAt?.toISOString() ?? null,
      createdAt: opportunity.createdAt.toISOString(),
      updatedAt: opportunity.updatedAt.toISOString(),
      activities: opportunity.activities.map((activity) => ({ ...activity, createdAt: activity.createdAt.toISOString() })),
      leadCaptures: opportunity.leadCaptures.map((lead) => ({ ...lead, createdAt: lead.createdAt.toISOString(), updatedAt: lead.updatedAt.toISOString() })),
      client: {
        ...opportunity.client,
        nextActionAt: opportunity.client.nextActionAt?.toISOString() ?? null,
        createdAt: opportunity.client.createdAt.toISOString(),
        updatedAt: opportunity.client.updatedAt.toISOString(),
        projects: opportunity.client.projects.map((project) => ({ ...project, startDate: project.startDate?.toISOString() ?? null, endDate: project.endDate?.toISOString() ?? null, createdAt: project.createdAt.toISOString(), updatedAt: project.updatedAt.toISOString() })),
        quotes: opportunity.client.quotes.map((quote) => ({ ...quote, date: quote.date.toISOString(), validUntil: quote.validUntil?.toISOString() ?? null, createdAt: quote.createdAt.toISOString(), updatedAt: quote.updatedAt.toISOString(), versions: quote.versions.map((version) => ({ ...version, createdAt: version.createdAt.toISOString() })) })),
        activities: opportunity.client.activities.map((activity) => ({ ...activity, happenedAt: activity.happenedAt.toISOString(), createdAt: activity.createdAt.toISOString() })),
      },
      stages: pipelineStages(opportunity.pipeline.stages),
      members: members.map((member) => ({ id: member.id, name: member.user.name || member.user.email || "Commercial" })),
    }
  }, "sales.read")
}

export async function addOpportunityActivity(opportunityId: string, input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const parsedId = id.parse(opportunityId)
    const data = activitySchema.parse(input)
    const opportunity = await prisma.opportunity.findFirst({
      where: { id: parsedId, pipeline: { companyId } },
      select: { id: true, clientId: true },
    })
    if (!opportunity) throw new Error("Opportunité introuvable")
    const activity = await prisma.$transaction(async (tx) => {
      const created = await tx.opportunityActivity.create({ data: { opportunityId: opportunity.id, ...data } })
      await tx.clientActivity.create({
        data: {
          clientId: opportunity.clientId,
          type: data.type,
          subject: "Suivi commercial",
          content: data.content,
          direction: data.type === "EMAIL" ? "OUTBOUND" : null,
          happenedAt: created.createdAt,
        },
      })
      return created
    })
    await logAction({ userId, action: "CREATE_OPPORTUNITY_ACTIVITY", resource: "OPPORTUNITY", resourceId: opportunity.id, payload: { activityId: activity.id, type: data.type } })
    revalidatePath(`/dashboard/pipeline/${opportunity.id}`)
    revalidatePath(`/dashboard/clients/${opportunity.clientId}`)
    return { success: true as const, id: activity.id }
  }, "sales.write")
}

export async function createOpportunity(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = opportunitySchema.parse(input)
    const pipeline = await ensurePipeline(companyId)
    const stages = pipelineStages(pipeline.stages)
    assertAllowedStatus(stages, data.status)
    await assertReferences(companyId, data.clientId, data.ownerMembershipId)
    const stage = resolveOpportunityStage({ status: data.status, probability: data.probability, lostReason: data.lostReason })
    const opportunity = await prisma.opportunity.create({
      data: {
        pipelineId: pipeline.id,
        clientId: data.clientId,
        title: data.title,
        status: data.status,
        valueCents: data.valueCents,
        closeDate: dateFromInput(data.closeDate),
        ownerMembershipId: data.ownerMembershipId,
        ...stage,
      },
      select: { id: true },
    })
    await logAction({ userId, action: "CREATE_OPPORTUNITY", resource: "OPPORTUNITY", resourceId: opportunity.id, payload: { status: data.status, valueCents: data.valueCents, ownerMembershipId: data.ownerMembershipId } })
    revalidatePath("/dashboard/pipeline")
    return { success: true as const, id: opportunity.id }
  }, "sales.write")
}

export async function updateOpportunity(opportunityId: string, input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const parsedId = id.parse(opportunityId)
    const rawInput = input && typeof input === "object" ? input as Record<string, unknown> : {}
    const ownerProvided = Object.prototype.hasOwnProperty.call(rawInput, "ownerMembershipId")
    const closeDateProvided = Object.prototype.hasOwnProperty.call(rawInput, "closeDate")
    const data = opportunitySchema.partial().parse(input)
    const existing = await prisma.opportunity.findFirst({
      where: { id: parsedId, pipeline: { companyId } },
      include: { pipeline: { select: { stages: true } } },
    })
    if (!existing) throw new Error("Opportunité introuvable")

    const status = data.status ?? existing.status
    assertAllowedStatus(pipelineStages(existing.pipeline.stages), status)
    const clientId = data.clientId ?? existing.clientId
    const ownerMembershipId = ownerProvided ? data.ownerMembershipId ?? null : existing.ownerMembershipId
    await assertReferences(companyId, clientId, ownerMembershipId)
    const stage = resolveOpportunityStage({
      status,
      probability: data.probability ?? existing.probability,
      lostReason: data.lostReason === undefined ? existing.lostReason : data.lostReason,
      closedAt: status === existing.status ? existing.closedAt : null,
    })
    await prisma.opportunity.update({
      where: { id: existing.id },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.clientId !== undefined ? { clientId } : {}),
        ...(data.status !== undefined ? { status } : {}),
        ...(data.valueCents !== undefined ? { valueCents: data.valueCents } : {}),
        ...(closeDateProvided ? { closeDate: dateFromInput(data.closeDate ?? null) } : {}),
        ...(ownerProvided ? { ownerMembershipId, ownerLabel: null } : {}),
        ...stage,
      },
    })
    await logAction({ userId, action: "UPDATE_OPPORTUNITY", resource: "OPPORTUNITY", resourceId: existing.id, payload: { fromStatus: existing.status, status, ownerMembershipId } })
    revalidatePath("/dashboard/pipeline")
    revalidatePath(`/dashboard/pipeline/${existing.id}`)
    return { success: true as const }
  }, "sales.write")
}

export async function deleteOpportunity(opportunityId: string) {
  return withAuth(async ({ companyId, userId }) => {
    const parsedId = id.parse(opportunityId)
    const existing = await prisma.opportunity.findFirst({ where: { id: parsedId, pipeline: { companyId } }, select: { id: true, status: true } })
    if (!existing) throw new Error("Opportunité introuvable")
    await prisma.opportunity.delete({ where: { id: existing.id } })
    await logAction({ userId, action: "DELETE_OPPORTUNITY", resource: "OPPORTUNITY", resourceId: existing.id, payload: { status: existing.status } })
    revalidatePath("/dashboard/pipeline")
    return { success: true as const }
  }, "sales.write")
}
