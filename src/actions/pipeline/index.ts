"use server"

import prisma from "@/lib/prisma"
import { withAuth } from "@/lib/auth-wrapper"
import { revalidatePath } from "next/cache"

const DEFAULT_STAGES = [
  { id: "PROSPECT", title: "Prospect" },
  { id: "CONTACTED", title: "Contact pris" },
  { id: "QUALIFIED", title: "Besoin qualifié" },
  { id: "SENT", title: "Devis envoyé" },
  { id: "WON", title: "Gagné" },
]

async function ensurePipeline(companyId: string) {
  let pipeline = await prisma.pipeline.findUnique({ where: { companyId } })
  if (!pipeline) {
    pipeline = await prisma.pipeline.create({
      data: { companyId, name: "Pipeline Commercial", stages: DEFAULT_STAGES },
    })
  }
  return pipeline
}

export async function getPipeline() {
  return await withAuth(async ({ companyId }) => {
    const pipeline = await ensurePipeline(companyId)
    return await prisma.pipeline.findUnique({
      where: { id: pipeline.id },
      include: {
        opportunities: {
          include: { client: { select: { id: true, name: true } } },
          orderBy: { updatedAt: "desc" },
        },
      },
    })
  })
}

export async function createOpportunity(data: {
  title: string
  clientId: string
  status: string
  valueCents: number
  probability: number
}) {
  return await withAuth(async ({ companyId }) => {
    const pipeline = await ensurePipeline(companyId)
    const opportunity = await prisma.opportunity.create({
      data: {
        pipelineId: pipeline.id,
        clientId: data.clientId,
        title: data.title,
        status: data.status,
        valueCents: data.valueCents,
        probability: data.probability,
      },
    })
    revalidatePath("/dashboard/pipeline")
    return opportunity
  })
}

export async function updateOpportunity(
  id: string,
  data: { title?: string; status?: string; valueCents?: number; probability?: number; clientId?: string }
) {
  return await withAuth(async ({ companyId }) => {
    const existing = await prisma.opportunity.findFirst({
      where: { id, pipeline: { companyId } },
    })
    if (!existing) throw new Error("Opportunité introuvable")

    const opp = await prisma.opportunity.update({
      where: { id },
      data,
    })
    revalidatePath("/dashboard/pipeline")
    return opp
  })
}

export async function deleteOpportunity(id: string) {
  return await withAuth(async ({ companyId }) => {
    const existing = await prisma.opportunity.findFirst({
      where: { id, pipeline: { companyId } },
    })
    if (!existing) throw new Error("Opportunité introuvable")
    await prisma.opportunity.delete({ where: { id } })
    revalidatePath("/dashboard/pipeline")
    return { ok: true }
  })
}
