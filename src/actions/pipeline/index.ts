"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { withAuth } from "@/lib/auth-wrapper"
import { logAction } from "@/lib/audit"
import {
  DEFAULT_PIPELINE_STAGES,
  parsePipelineStages,
  resolveOpportunityStage,
  validatePipelineStages,
} from "@/lib/pipeline-rules"
import prisma from "@/lib/prisma"

const id = z.string().cuid()
const optionalId = z.union([id, z.literal(""), z.null()]).optional().transform((value) => value || null)
const optionalDate = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(""), z.null()]).optional().transform((value) => value || null)
const opportunityBaseSchema = z.object({
  title: z.string().trim().min(2, "Le titre est requis").max(180),
  clientId: id,
  status: z.string().trim().min(1).max(64),
  valueCents: z.coerce.number().int().min(0).max(2_000_000_000),
  probability: z.coerce.number().int().min(0).max(100),
  ownerMembershipId: optionalId,
  closeDate: optionalDate,
  lostReason: z.string().trim().max(500).optional().nullable(),
})
const createOpportunitySchema = opportunityBaseSchema.extend({ pipelineId: id.optional() })

const pipelineNameSchema = z.string().trim().min(2, "Le nom du pipeline est requis").max(100)
const pipelineConfigurationSchema = z.object({
  name: pipelineNameSchema,
  stages: z.unknown(),
})

const activitySchema = z.object({
  type: z.enum(["EMAIL", "CALL", "MEETING", "NOTE"]),
  content: z.string().trim().min(2, "Le compte rendu est requis").max(5_000),
})

function assertAllowedStatus(stages: Array<{ id: string }>, status: string) {
  if (status !== "LOST" && !stages.some((stage) => stage.id === status)) throw new Error("Étape commerciale invalide")
}

function dateFromInput(value: string | null) {
  return value ? new Date(`${value}T12:00:00.000Z`) : null
}

async function ensurePipeline(companyId: string) {
  const existing = await prisma.pipeline.findFirst({
    where: { companyId },
    orderBy: [{ isDefault: "desc" }, { position: "asc" }, { createdAt: "asc" }],
  })
  if (existing?.isDefault) return existing
  if (existing) {
    return prisma.pipeline.update({ where: { id: existing.id }, data: { isDefault: true } })
  }
  return prisma.pipeline.create({
    data: {
      companyId,
      name: "Pipeline commercial",
      stages: DEFAULT_PIPELINE_STAGES,
      isDefault: true,
    },
  })
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

export async function getPipeline(requestedPipelineId?: string) {
  return withAuth(async ({ companyId }) => {
    const defaultPipeline = await ensurePipeline(companyId)
    const [availablePipelines, members] = await Promise.all([
      prisma.pipeline.findMany({
        where: { companyId },
        select: {
          id: true,
          name: true,
          isDefault: true,
          position: true,
          _count: { select: { opportunities: true } },
        },
        orderBy: [{ isDefault: "desc" }, { position: "asc" }, { createdAt: "asc" }],
      }),
      prisma.membership.findMany({
        where: { companyId, status: "ACTIVE", role: { in: ["OWNER", "ADMIN", "SALES"] } },
        include: { user: { select: { name: true, email: true } } },
        orderBy: { createdAt: "asc" },
      }),
    ])
    const requestedId = id.safeParse(requestedPipelineId).success ? requestedPipelineId : null
    const selectedId = availablePipelines.some((pipeline) => pipeline.id === requestedId)
      ? requestedId!
      : defaultPipeline.id
    const pipeline = await prisma.pipeline.findFirstOrThrow({
      where: { id: selectedId, companyId },
      include: {
        opportunities: {
          include: {
            client: { select: { id: true, name: true } },
            ownerMembership: { include: { user: { select: { name: true, email: true } } } },
          },
          orderBy: { updatedAt: "desc" },
        },
      },
    })

    return {
      id: pipeline.id,
      name: pipeline.name,
      isDefault: pipeline.isDefault,
      stages: parsePipelineStages(pipeline.stages),
      pipelines: availablePipelines.map((item) => ({
        id: item.id,
        name: item.name,
        isDefault: item.isDefault,
        opportunityCount: item._count.opportunities,
      })),
      members: members.map((member) => ({ id: member.id, name: member.user.name || member.user.email || "Commercial" })),
      opportunities: pipeline.opportunities.map((opportunity) => ({
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

async function assertPipelineNameAvailable(companyId: string, name: string, ignoredPipelineId?: string) {
  const pipelines = await prisma.pipeline.findMany({
    where: { companyId, ...(ignoredPipelineId ? { id: { not: ignoredPipelineId } } : {}) },
    select: { name: true },
  })
  if (pipelines.some((pipeline) => pipeline.name.toLocaleLowerCase("fr") === name.toLocaleLowerCase("fr"))) {
    throw new Error("Un pipeline porte déjà ce nom")
  }
}

export async function createPipeline(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = pipelineConfigurationSchema.parse(input)
    const stages = validatePipelineStages(data.stages)
    const [pipelineCount] = await Promise.all([
      prisma.pipeline.count({ where: { companyId } }),
      assertPipelineNameAvailable(companyId, data.name),
    ])
    if (pipelineCount >= 20) throw new Error("La limite de 20 pipelines est atteinte")
    const pipeline = await prisma.pipeline.create({
      data: {
        companyId,
        name: data.name,
        stages,
        isDefault: pipelineCount === 0,
        position: pipelineCount,
      },
      select: { id: true },
    })
    await logAction({
      userId,
      action: "CREATE_PIPELINE",
      resource: "PIPELINE",
      resourceId: pipeline.id,
      payload: { name: data.name, stageCount: stages.length },
    })
    revalidatePath("/dashboard/pipeline")
    return { success: true as const, id: pipeline.id }
  }, "sales.write")
}

export async function updatePipeline(pipelineId: string, input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const parsedId = id.parse(pipelineId)
    const data = pipelineConfigurationSchema.parse(input)
    const stages = validatePipelineStages(data.stages)
    const pipeline = await prisma.pipeline.findFirst({
      where: { id: parsedId, companyId },
      select: { id: true, name: true, stages: true },
    })
    if (!pipeline) throw new Error("Pipeline introuvable")
    await assertPipelineNameAvailable(companyId, data.name, pipeline.id)

    const nextStageIds = new Set(stages.map((stage) => stage.id))
    const removedStageIds = parsePipelineStages(pipeline.stages)
      .map((stage) => stage.id)
      .filter((stageId) => stageId !== "LOST" && !nextStageIds.has(stageId))
    if (removedStageIds.length) {
      const occupiedStage = await prisma.opportunity.findFirst({
        where: { pipelineId: pipeline.id, status: { in: removedStageIds } },
        select: { status: true },
      })
      if (occupiedStage) {
        throw new Error("Déplacez les opportunités de l’étape avant de la supprimer")
      }
    }

    await prisma.pipeline.update({
      where: { id: pipeline.id },
      data: { name: data.name, stages },
    })
    await logAction({
      userId,
      action: "UPDATE_PIPELINE",
      resource: "PIPELINE",
      resourceId: pipeline.id,
      payload: { previousName: pipeline.name, name: data.name, stageCount: stages.length },
    })
    revalidatePath("/dashboard/pipeline")
    return { success: true as const }
  }, "sales.write")
}

export async function setDefaultPipeline(pipelineId: string) {
  return withAuth(async ({ companyId, userId }) => {
    const parsedId = id.parse(pipelineId)
    const pipeline = await prisma.pipeline.findFirst({
      where: { id: parsedId, companyId },
      select: { id: true, name: true, isDefault: true },
    })
    if (!pipeline) throw new Error("Pipeline introuvable")
    if (!pipeline.isDefault) {
      await prisma.$transaction([
        prisma.pipeline.updateMany({ where: { companyId, isDefault: true }, data: { isDefault: false } }),
        prisma.pipeline.update({ where: { id: pipeline.id }, data: { isDefault: true } }),
      ])
      await logAction({
        userId,
        action: "SET_DEFAULT_PIPELINE",
        resource: "PIPELINE",
        resourceId: pipeline.id,
        payload: { name: pipeline.name },
      })
    }
    revalidatePath("/dashboard/pipeline")
    return { success: true as const }
  }, "sales.write")
}

export async function deletePipeline(pipelineId: string) {
  return withAuth(async ({ companyId, userId }) => {
    const parsedId = id.parse(pipelineId)
    const pipelines = await prisma.pipeline.findMany({
      where: { companyId },
      select: { id: true, name: true, isDefault: true, _count: { select: { opportunities: true } } },
      orderBy: [{ isDefault: "desc" }, { position: "asc" }, { createdAt: "asc" }],
    })
    const pipeline = pipelines.find((item) => item.id === parsedId)
    if (!pipeline) throw new Error("Pipeline introuvable")
    if (pipelines.length === 1) throw new Error("Le dernier pipeline ne peut pas être supprimé")
    if (pipeline._count.opportunities > 0) throw new Error("Ce pipeline contient encore des opportunités")

    const fallback = pipelines.find((item) => item.id !== pipeline.id)!
    await prisma.$transaction([
      prisma.pipeline.delete({ where: { id: pipeline.id } }),
      ...(pipeline.isDefault
        ? [prisma.pipeline.update({ where: { id: fallback.id }, data: { isDefault: true } })]
        : []),
    ])
    await logAction({
      userId,
      action: "DELETE_PIPELINE",
      resource: "PIPELINE",
      resourceId: pipeline.id,
      payload: { name: pipeline.name },
    })
    revalidatePath("/dashboard/pipeline")
    return { success: true as const, fallbackId: fallback.id }
  }, "sales.write")
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
      stages: parsePipelineStages(opportunity.pipeline.stages),
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
    const data = createOpportunitySchema.parse(input)
    const pipeline = data.pipelineId
      ? await prisma.pipeline.findFirst({ where: { id: data.pipelineId, companyId } })
      : await ensurePipeline(companyId)
    if (!pipeline) throw new Error("Pipeline introuvable")
    const stages = parsePipelineStages(pipeline.stages)
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
    await logAction({ userId, action: "CREATE_OPPORTUNITY", resource: "OPPORTUNITY", resourceId: opportunity.id, payload: { pipelineId: pipeline.id, status: data.status, valueCents: data.valueCents, ownerMembershipId: data.ownerMembershipId } })
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
    const data = opportunityBaseSchema.partial().parse(input)
    const existing = await prisma.opportunity.findFirst({
      where: { id: parsedId, pipeline: { companyId } },
      include: { pipeline: { select: { stages: true } } },
    })
    if (!existing) throw new Error("Opportunité introuvable")

    const status = data.status ?? existing.status
    assertAllowedStatus(parsePipelineStages(existing.pipeline.stages), status)
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
