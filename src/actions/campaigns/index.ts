"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { logAction } from "@/lib/audit"
import { withAuth } from "@/lib/auth-wrapper"
import { nextSequenceExecution } from "@/lib/automations/schedule"
import { evaluateCampaignAudience } from "@/lib/marketing/campaign-audience"
import prisma from "@/lib/prisma"
import { pinSequenceSender } from "@/lib/communications/email-provider"
import { campaignSchema, campaignAssetSchema, CampaignManagementError, editCampaign, editCampaignAsset, lockCampaignAudience } from "@/lib/marketing/campaign-management"
import { campaignDashboard, campaignAssets, campaignChoices, campaignSequences } from "@/lib/marketing/campaign-directory"
import { isPublicReadOnlyDemo, DEMO_READ_ONLY_MESSAGE } from "@/lib/demo-policy"

const cuid = z.string().cuid()
const statusSchema = z.enum(["DRAFT", "PLANNED", "ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"])
export async function getCampaignDashboard(input: unknown = {}) {
  return withAuth(({ companyId }) => campaignDashboard(companyId, input), "automation.read")
}
export async function getCampaignAssets(input: unknown) {
  return withAuth(({ companyId }) => campaignAssets(companyId, input), "automation.read")
}
export async function getCampaignChoices(input: unknown) {
  return withAuth(({ companyId }) => campaignChoices(companyId, input), "automation.read")
}
export async function getCampaignSequences(input: unknown) {
  return withAuth(({ companyId }) => campaignSequences(companyId, input), "automation.read")
}
export async function createMarketingCampaign(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = campaignSchema.parse(input)
    const [segment, owner] = await Promise.all([
      data.segmentId ? prisma.marketingSegment.findFirst({ where: { id: data.segmentId, companyId, status: "ACTIVE" }, select: { id: true } }) : null,
      data.ownerMembershipId ? prisma.membership.findFirst({ where: { id: data.ownerMembershipId, companyId, status: "ACTIVE" }, select: { id: true } }) : null,
    ])
    if (data.segmentId && !segment) throw new Error("Segment introuvable")
    if (data.ownerMembershipId && !owner) throw new Error("Responsable introuvable")
    const campaign = await prisma.marketingCampaign.create({
      data: {
        companyId,
        name: data.name,
        objective: data.objective,
        channels: data.channels,
        segmentId: segment?.id || null,
        ownerMembershipId: owner?.id || null,
        startAt: data.startAt instanceof Date ? data.startAt : null,
        endAt: data.endAt instanceof Date ? data.endAt : null,
        budgetCents: data.budgetCents,
        utmCampaign: data.utmCampaign || null,
        notes: data.notes || null,
      },
    })
    await logAction({
      userId,
      action: "CREATE_MARKETING_CAMPAIGN",
      resource: "MARKETING_CAMPAIGN",
      resourceId: campaign.id,
      payload: { name: campaign.name, channels: data.channels },
    })
    revalidatePath("/dashboard/campagnes")
    revalidatePath("/dashboard/marketing/overview")
    return { success: true as const, id: campaign.id }
  }, "automation.write")
}

export async function updateMarketingCampaignStatus(id: string, status: string, version?: number) {
  return withAuth(async ({ companyId, userId }) => {
    const campaignId = cuid.parse(id)
    const nextStatus = statusSchema.parse(status)
    const expectedVersion = version === undefined ? undefined : z.number().int().positive().parse(version)
    const campaign = await prisma.marketingCampaign.findFirst({ where: { id: campaignId, companyId }, select: { id: true, name: true, status: true, version: true } })
    if (!campaign) throw new Error("Campagne introuvable")
    if (["COMPLETED", "ARCHIVED"].includes(campaign.status) && nextStatus !== campaign.status && nextStatus !== "ARCHIVED") return { success: false as const, error: "Une campagne terminée ne peut pas redémarrer ; créez une nouvelle campagne" }
    const saved = await prisma.marketingCampaign.updateMany({ where: { id: campaign.id, companyId, version: expectedVersion ?? campaign.version }, data: { status: nextStatus, version: { increment: 1 } } })
    if (saved.count !== 1) return { success: false as const, error: "La campagne a changé ; actualisez" }
    await logAction({ userId, action: "UPDATE_MARKETING_CAMPAIGN", resource: "MARKETING_CAMPAIGN", resourceId: campaign.id, payload: { status: nextStatus } })
    revalidatePath("/dashboard/campagnes")
    return { success: true as const }
  }, "automation.write")
}

export async function addMarketingCampaignAsset(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = campaignAssetSchema.parse(input)
    const campaign = await prisma.marketingCampaign.findFirst({ where: { id: data.campaignId, companyId }, select: { id: true } })
    if (!campaign) throw new Error("Campagne introuvable")
    if (data.ownerMembershipId && !(await prisma.membership.findFirst({ where: { id: data.ownerMembershipId, companyId, status: "ACTIVE" }, select: { id: true } })))
      throw new Error("Responsable introuvable")
    const asset = await prisma.marketingCampaignAsset.create({
      data: {
        campaignId: campaign.id,
        type: data.type,
        name: data.name,
        ownerMembershipId: data.ownerMembershipId || null,
        dueAt: data.dueAt instanceof Date ? data.dueAt : null,
        url: data.url || null,
      },
    })
    await logAction({
      userId,
      action: "UPDATE_MARKETING_CAMPAIGN_ASSET",
      resource: "MARKETING_CAMPAIGN_ASSET",
      resourceId: asset.id,
      payload: { campaignId: campaign.id, type: asset.type },
    })
    revalidatePath("/dashboard/campagnes")
    return { success: true as const }
  }, "automation.write")
}

export async function updateMarketingCampaignAssetStatus(assetId: string, status: string, version?: number) {
  return withAuth(async ({ companyId, userId }) => {
    const id = cuid.parse(assetId)
    const nextStatus = z.enum(["TODO", "IN_PROGRESS", "READY", "PUBLISHED", "CANCELLED"]).parse(status)
    const expectedVersion = version === undefined ? undefined : z.number().int().positive().parse(version)
    const asset = await prisma.marketingCampaignAsset.findFirst({ where: { id, campaign: { companyId } }, select: { id: true, campaignId: true } })
    if (!asset) throw new Error("Élément de campagne introuvable")
    const saved = await prisma.marketingCampaignAsset.updateMany({ where: { id, campaign: { companyId, status: { notIn: ["COMPLETED", "ARCHIVED"] } }, ...(expectedVersion ? { version: expectedVersion } : {}) }, data: { status: nextStatus, version: { increment: 1 } } })
    if (saved.count !== 1) return { success: false as const, error: "Le livrable a changé ou la campagne est terminée ; actualisez" }
    await logAction({ userId, action: "UPDATE_MARKETING_CAMPAIGN_ASSET", resource: "MARKETING_CAMPAIGN_ASSET", resourceId: id, payload: { status: nextStatus } })
    revalidatePath("/dashboard/campagnes")
    return { success: true as const }
  }, "automation.write")
}

export async function attachSequenceToCampaign(campaignId: string, sequenceId: string) {
  return withAuth(async ({ companyId, userId }) => {
    const [campaign, sequence] = await Promise.all([
      prisma.marketingCampaign.findFirst({ where: { id: cuid.parse(campaignId), companyId }, select: { id: true } }),
      prisma.emailSequence.findFirst({ where: { id: cuid.parse(sequenceId), companyId }, select: { id: true } }),
    ])
    if (!campaign || !sequence) throw new Error("Campagne ou séquence introuvable")
    await prisma.$transaction(async tx => {
      const current = await tx.marketingCampaign.findFirst({ where: { id: campaign.id, companyId } })
      if (!current) throw new CampaignManagementError("Campagne introuvable")
      const claimed = await tx.marketingCampaign.updateMany({ where: { id: current.id, companyId, version: current.version }, data: { version: { increment: 1 } } })
      if (claimed.count !== 1) throw new CampaignManagementError("La campagne a changé ; actualisez")
      const currentSequence = await tx.emailSequence.findFirst({ where: { id: sequence.id, companyId } })
      if (!currentSequence) throw new CampaignManagementError("Séquence introuvable")
      if (currentSequence.campaignId === current.id) return
      if (currentSequence.campaignId || current.audienceLockedAt || ["COMPLETED", "ARCHIVED"].includes(current.status) || await tx.emailSequenceEnrollment.count({ where: { OR: [{ sequence: { companyId, campaignId: current.id } }, { sequenceId: currentSequence.id }] } })) throw new CampaignManagementError("Le rattachement est verrouillé après inscription ; utilisez une nouvelle campagne et séquence")
      const saved = await tx.emailSequence.updateMany({ where: { id: currentSequence.id, companyId, campaignId: null, enrollments: { none: {} } }, data: { campaignId: current.id } })
      if (saved.count !== 1) throw new CampaignManagementError("La séquence a changé ; actualisez")
    })
    await logAction({ userId, action: "UPDATE_MARKETING_CAMPAIGN", resource: "MARKETING_CAMPAIGN", resourceId: campaign.id, payload: { sequenceId: sequence.id } })
    revalidatePath("/dashboard/campagnes")
    return { success: true as const }
  }, "automation.write")
}

const campaignAudienceSchema = z.object({ campaignId: cuid, sequenceId: cuid })

export async function enrollCampaignAudience(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = campaignAudienceSchema.parse(input)
    const [campaign, sequence] = await Promise.all([
      prisma.marketingCampaign.findFirst({
        where: { id: data.campaignId, companyId },
        select: {
          id: true,
          name: true,
          status: true,
          startAt: true,
          endAt: true,
          version: true,
          segment: {
            select: {
              _count: { select: { memberships: { where: { leadCapture: { companyId } } } } },
              memberships: {
                where: { leadCapture: { companyId } },
                orderBy: { addedAt: "asc" },
                take: 5_000,
                select: {
                  leadCapture: {
                    select: {
                      id: true,
                      email: true,
                      marketingOptIn: true,
                      status: true,
                      contactId: true,
                      contact: { select: { marketingStatus: true } },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      prisma.emailSequence.findFirst({
        where: { id: data.sequenceId, companyId, campaignId: data.campaignId, status: "ACTIVE" },
        include: { steps: { orderBy: { position: "asc" } } },
      }),
    ])
    if (!campaign) throw new Error("Campagne introuvable")
    if (!campaign.segment) throw new Error("Associez un segment à la campagne avant de lancer l’audience")
    if (campaign.segment._count.memberships > 5_000) throw new Error("Ce segment dépasse 5 000 prospects. Créez des sous-segments pour préserver la délivrabilité et le suivi des lots")
    if (!sequence) throw new Error("Choisissez une séquence active rattachée à cette campagne")
    if (!sequence.steps[0]) throw new Error("La séquence ne contient aucune étape")
    if (!["PLANNED", "ACTIVE"].includes(campaign.status)) throw new Error("Planifiez ou activez la campagne avant d’inscrire son audience")
    if (campaign.endAt && campaign.endAt <= new Date()) throw new Error("La période de cette campagne est terminée")

    const leads = campaign.segment.memberships.map((membership) => membership.leadCapture)
    const existing = leads.length
      ? await prisma.emailSequenceEnrollment.findMany({
          where: { sequenceId: sequence.id, leadCaptureId: { in: leads.map((lead) => lead.id) } },
          select: { leadCaptureId: true },
        })
      : []
    const suppressedEmails = await prisma.emailSuppression.findMany({
      where: { companyId, active: true, email: { in: leads.flatMap((lead) => lead.email ? [lead.email.trim().toLowerCase()] : []) } },
      select: { email: true },
    })
    const readiness = evaluateCampaignAudience(leads, existing.map((enrollment) => enrollment.leadCaptureId), suppressedEmails.map((suppression) => suppression.email))
    const { eligibleIds, ...audienceCounts } = readiness
    const leadsById = new Map(leads.map((lead) => [lead.id, lead]))
    const firstStep = sequence.steps[0]
    const enrolledAt = new Date()
    const nextSendAt = nextSequenceExecution(campaign.startAt && campaign.startAt > enrolledAt ? campaign.startAt : enrolledAt, firstStep.delayHours, sequence)

    if (eligibleIds.length) {
      if (sequence.steps.some((step) => step.type === "EMAIL")) await pinSequenceSender(companyId, sequence.id)
      let campaignVersion = campaign.version
      for (let offset = 0; offset < eligibleIds.length; offset += 200) {
        const batch = eligibleIds.slice(offset, offset + 200)
        const current = await prisma.marketingCampaign.findFirst({ where: { id: campaign.id, companyId }, select: { status: true, endAt: true } })
        if (!current || !["PLANNED", "ACTIVE"].includes(current.status) || (current.endAt && current.endAt <= new Date())) throw new Error("La campagne ne permet plus de nouvelles inscriptions")
        campaignVersion = await prisma.$transaction(async tx => {
          const nextVersion = await lockCampaignAudience(tx, companyId, campaign.id, campaignVersion)
          const pinned = await tx.emailSequence.updateMany({ where: { id: sequence.id, companyId, campaignId: campaign.id, status: "ACTIVE" }, data: { updatedAt: new Date() } })
          if (pinned.count !== 1) throw new CampaignManagementError("La séquence a changé ; actualisez")
          for (const leadCaptureId of batch) {
            const lead = leadsById.get(leadCaptureId)
            await tx.emailSequenceEnrollment.upsert({
              where: { sequenceId_leadCaptureId: { sequenceId: sequence.id, leadCaptureId } },
              update: {},
              create: {
                sequenceId: sequence.id,
                leadCaptureId,
                contactId: lead?.contactId || null,
                status: "ACTIVE",
                nextStepPosition: firstStep.position,
                nextSendAt,
              },
            })
          }
          return nextVersion
        })
      }
    }

    await Promise.all([
      logAction({
        userId,
        action: "ENROLL_MARKETING_CAMPAIGN_AUDIENCE",
        resource: "MARKETING_CAMPAIGN",
        resourceId: campaign.id,
        payload: { sequenceId: sequence.id, enrolled: eligibleIds.length, ...audienceCounts },
      }),
    ])
    revalidatePath("/dashboard/campagnes")
    revalidatePath("/dashboard/automatisations")
    return { success: true as const, enrolled: eligibleIds.length, ...audienceCounts }
  }, "automation.write")
}

async function campaignEditAction(input: unknown, resource: boolean) {
  if (isPublicReadOnlyDemo()) return { success: false as const, error: DEMO_READ_ONLY_MESSAGE }
  return withAuth(async ({ companyId, userId }) => {
    try {
      const result = resource ? await editCampaignAsset(companyId, userId, input) : await editCampaign(companyId, userId, input)
      revalidatePath("/dashboard/campagnes")
      revalidatePath("/dashboard/marketing/overview")
      return result
    } catch (error) {
      if (error instanceof CampaignManagementError) return { success: false as const, error: error.message }
      if (error instanceof z.ZodError) return { success: false as const, error: error.issues[0]?.message || "Formulaire invalide" }
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") return { success: false as const, error: "Ce nom est déjà utilisé" }
      throw error
    }
  }, "automation.write")
}
export async function updateMarketingCampaign(input: unknown) { return campaignEditAction(input, false) }
export async function updateMarketingCampaignAsset(input: unknown) { return campaignEditAction(input, true) }
