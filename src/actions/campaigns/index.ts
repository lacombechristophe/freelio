"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { logAction } from "@/lib/audit"
import { withAuth } from "@/lib/auth-wrapper"
import prisma from "@/lib/prisma"
import { campaignSchema, campaignAssetSchema, CampaignManagementError, editCampaign, editCampaignAsset } from "@/lib/marketing/campaign-management"
import { campaignDashboard, campaignAssets, campaignChoices, campaignSequences } from "@/lib/marketing/campaign-directory"
import { isPublicReadOnlyDemo, DEMO_READ_ONLY_MESSAGE } from "@/lib/demo-policy"
import { captureCampaignAudience, changeCampaignActivation, campaignAudienceReport, campaignAudienceHistory } from "@/lib/marketing/campaign-activation"

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

/** Historical entry point cannot bypass the verified durable activation. */
export async function enrollCampaignAudience(input: unknown) {
  void input
  return withAuth(async () => ({ success: false as const, error: "Vérifiez l’audience puis inscrivez la capture vérifiée ; le lancement direct n’est plus disponible" }), "automation.write")
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

async function activationAction(input: unknown, capture: boolean) {
  if (isPublicReadOnlyDemo()) return { success: false as const, error: DEMO_READ_ONLY_MESSAGE }
  return withAuth(async ({ companyId, userId }) => {
    try {
      const result = capture ? await captureCampaignAudience(companyId, userId, input) : await changeCampaignActivation(companyId, userId, input)
      revalidatePath("/dashboard/campagnes")
      return result
    } catch (error) {
      if (error instanceof CampaignManagementError) return { success: false as const, error: error.message }
      if (error instanceof z.ZodError) return { success: false as const, error: "Paramètres d’activation invalides" }
      if (error && typeof error === "object" && "code" in error && ["P2034", "P2028"].includes(String(error.code))) return { success: false as const, error: "Vérification interrompue ou conflit ; l’ancienne capture est conservée. Actualisez puis réessayez." }
      throw error
    }
  }, "automation.write")
}
export async function verifyMarketingCampaignAudience(input: unknown) { return activationAction(input, true) }
export async function controlMarketingCampaignActivation(input: unknown) { return activationAction(input, false) }
export async function getMarketingCampaignAudienceReport(input: unknown) { return withAuth(({ companyId }) => campaignAudienceReport(companyId, input), "automation.read") }
export async function getMarketingCampaignAudienceHistory(input: unknown) { return withAuth(({ companyId }) => campaignAudienceHistory(companyId, input), "automation.read") }
