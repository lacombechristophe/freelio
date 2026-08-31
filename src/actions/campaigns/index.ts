"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { logAction } from "@/lib/audit"
import { withAuth } from "@/lib/auth-wrapper"
import prisma from "@/lib/prisma"

const cuid = z.string().cuid()
const channelSchema = z.enum(["EMAIL", "SMS", "FORM", "SOCIAL", "ADS", "EVENT", "CONTENT"])
const statusSchema = z.enum(["DRAFT", "PLANNED", "ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"])
const campaignSchema = z
  .object({
    name: z.string().trim().min(2).max(140),
    objective: z.string().trim().min(2).max(180),
    channels: z.array(channelSchema).min(1).max(7),
    segmentId: z.union([cuid, z.literal("")]).optional(),
    ownerMembershipId: z.union([cuid, z.literal("")]).optional(),
    startAt: z.union([z.coerce.date(), z.literal(""), z.null()]).optional(),
    endAt: z.union([z.coerce.date(), z.literal(""), z.null()]).optional(),
    budgetCents: z.coerce.number().int().min(0).max(1_000_000_000).default(0),
    utmCampaign: z.string().trim().max(120).optional().default(""),
    notes: z.string().trim().max(2_000).optional().default(""),
  })
  .superRefine((data, context) => {
    if (data.startAt instanceof Date && data.endAt instanceof Date && data.endAt < data.startAt)
      context.addIssue({ code: "custom", path: ["endAt"], message: "La fin doit être postérieure au début" })
  })

export async function getCampaignDashboard() {
  return withAuth(async ({ companyId }) => {
    const [campaigns, segments, sequences, members, attributed, deliveryStats] = await Promise.all([
      prisma.marketingCampaign.findMany({
        where: { companyId, status: { not: "ARCHIVED" } },
        include: {
          segment: { select: { id: true, name: true, _count: { select: { memberships: true } } } },
          ownerMembership: { select: { id: true, user: { select: { name: true, email: true } } } },
          assets: { orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }], take: 100 },
          sequences: { include: { _count: { select: { enrollments: true, deliveries: true } } }, orderBy: { updatedAt: "desc" }, take: 100 },
        },
        orderBy: [{ startAt: "desc" }, { createdAt: "desc" }],
        take: 200,
      }),
      prisma.marketingSegment.findMany({
        where: { companyId, status: "ACTIVE" },
        select: { id: true, name: true, _count: { select: { memberships: true } } },
        orderBy: { name: "asc" },
        take: 200,
      }),
      prisma.emailSequence.findMany({
        where: { companyId, status: { not: "ARCHIVED" } },
        select: { id: true, name: true, status: true, campaignId: true },
        orderBy: { name: "asc" },
        take: 500,
      }),
      prisma.membership.findMany({
        where: { companyId, status: "ACTIVE" },
        select: { id: true, user: { select: { name: true, email: true } } },
        orderBy: { createdAt: "asc" },
        take: 500,
      }),
      prisma.leadCapture.groupBy({ by: ["utmCampaign"], where: { companyId, utmCampaign: { not: null } }, _count: { _all: true } }),
      prisma.emailDelivery.groupBy({ by: ["sequenceId", "status"], where: { companyId, sequence: { campaignId: { not: null } } }, _count: { _all: true } }),
    ])
    const attributedMap = new Map(attributed.map((item) => [item.utmCampaign, item._count._all]))
    const deliveryStatsBySequence = new Map<string, Record<string, number>>()
    for (const item of deliveryStats) {
      if (!item.sequenceId) continue
      const stats = deliveryStatsBySequence.get(item.sequenceId) ?? {}
      stats[item.status] = item._count._all
      deliveryStatsBySequence.set(item.sequenceId, stats)
    }
    return {
      segments,
      sequences,
      members,
      campaigns: campaigns.map((campaign) => {
        const statusCount = (statuses: string[]) =>
          campaign.sequences.reduce((total, sequence) => {
            const stats = deliveryStatsBySequence.get(sequence.id) ?? {}
            return total + statuses.reduce((sum, status) => sum + (stats[status] ?? 0), 0)
          }, 0)
        return {
          ...campaign,
          channels: Array.isArray(campaign.channels) ? campaign.channels.filter((item): item is string => typeof item === "string") : [],
          startAt: campaign.startAt?.toISOString() ?? null,
          endAt: campaign.endAt?.toISOString() ?? null,
          createdAt: campaign.createdAt.toISOString(),
          updatedAt: campaign.updatedAt.toISOString(),
          assets: campaign.assets.map((asset) => ({
            ...asset,
            dueAt: asset.dueAt?.toISOString() ?? null,
            createdAt: asset.createdAt.toISOString(),
            updatedAt: asset.updatedAt.toISOString(),
          })),
          attributedLeads: campaign.utmCampaign ? (attributedMap.get(campaign.utmCampaign) ?? 0) : 0,
          deliveryStats: {
            total: campaign.sequences.reduce((total, sequence) => total + sequence._count.deliveries, 0),
            delivered: statusCount(["DELIVERED", "OPENED", "CLICKED"]),
            opened: statusCount(["OPENED", "CLICKED"]),
            clicked: statusCount(["CLICKED"]),
            failed: statusCount(["FAILED", "BOUNCED", "COMPLAINED", "SUPPRESSED"]),
          },
        }
      }),
    }
  }, "automation.read")
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

export async function updateMarketingCampaignStatus(id: string, status: string) {
  return withAuth(async ({ companyId, userId }) => {
    const campaignId = cuid.parse(id)
    const nextStatus = statusSchema.parse(status)
    const campaign = await prisma.marketingCampaign.findFirst({ where: { id: campaignId, companyId }, select: { id: true, name: true } })
    if (!campaign) throw new Error("Campagne introuvable")
    await prisma.marketingCampaign.update({ where: { id: campaign.id }, data: { status: nextStatus } })
    await logAction({ userId, action: "UPDATE_MARKETING_CAMPAIGN", resource: "MARKETING_CAMPAIGN", resourceId: campaign.id, payload: { status: nextStatus } })
    revalidatePath("/dashboard/campagnes")
    return { success: true as const }
  }, "automation.write")
}

const assetSchema = z.object({
  campaignId: cuid,
  type: z.enum(["EMAIL", "FORM", "SMS", "SOCIAL", "ADS", "EVENT", "CONTENT", "DOCUMENT", "OTHER"]),
  name: z.string().trim().min(2).max(160),
  ownerMembershipId: z.union([cuid, z.literal("")]).optional(),
  dueAt: z.union([z.coerce.date(), z.literal(""), z.null()]).optional(),
  url: z.union([z.string().trim().url(), z.literal("")]).optional(),
})

export async function addMarketingCampaignAsset(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = assetSchema.parse(input)
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

export async function updateMarketingCampaignAssetStatus(assetId: string, status: string) {
  return withAuth(async ({ companyId, userId }) => {
    const id = cuid.parse(assetId)
    const nextStatus = z.enum(["TODO", "IN_PROGRESS", "READY", "PUBLISHED", "CANCELLED"]).parse(status)
    const asset = await prisma.marketingCampaignAsset.findFirst({ where: { id, campaign: { companyId } }, select: { id: true, campaignId: true } })
    if (!asset) throw new Error("Élément de campagne introuvable")
    await prisma.marketingCampaignAsset.update({ where: { id }, data: { status: nextStatus } })
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
    await prisma.emailSequence.update({ where: { id: sequence.id }, data: { campaignId: campaign.id } })
    await logAction({ userId, action: "UPDATE_MARKETING_CAMPAIGN", resource: "MARKETING_CAMPAIGN", resourceId: campaign.id, payload: { sequenceId: sequence.id } })
    revalidatePath("/dashboard/campagnes")
    return { success: true as const }
  }, "automation.write")
}
