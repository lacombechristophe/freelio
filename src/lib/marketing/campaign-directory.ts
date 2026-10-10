import "server-only"
import { Prisma } from "@prisma/client"
import { z } from "zod"
import prisma from "@/lib/prisma"
import { campaignPageSchema, CampaignManagementError } from "./campaign-management"

export async function campaignDashboard(companyId: string, input: unknown = {}) {
  const query = campaignPageSchema.parse(input)
  const where: Prisma.MarketingCampaignWhereInput = { companyId, status: { not: "ARCHIVED" }, ...(query.search ? { OR: [{ name: { contains: query.search } }, { objective: { contains: query.search } }] } : {}) }
  return prisma.$transaction(async tx => {
    const total = await tx.marketingCampaign.count({ where }), pageCount = Math.max(1, Math.ceil(total / 25)), page = Math.min(query.page, pageCount)
    const campaigns = await tx.marketingCampaign.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 25, skip: (page - 1) * 25,
      include: { segment: { select: { id: true, name: true, _count: { select: { memberships: true } } } }, ownerMembership: { select: { id: true, user: { select: { name: true, email: true } } } },
        assets: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 25 }, sequences: { include: { _count: { select: { enrollments: true, deliveries: true } } }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: 25 },
        _count: { select: { assets: true, sequences: true, audiences: true } } } })
    const [segments, sequences, members, active, budget, deliveries] = await Promise.all([
      tx.marketingSegment.findMany({ where: { companyId, status: "ACTIVE" }, select: { id: true, name: true, _count: { select: { memberships: true } } }, orderBy: [{ name: "asc" }, { id: "asc" }], take: 25 }),
      tx.emailSequence.findMany({ where: { companyId, status: { not: "ARCHIVED" } }, select: { id: true, name: true, status: true, campaignId: true }, orderBy: [{ name: "asc" }, { id: "asc" }], take: 25 }),
      tx.membership.findMany({ where: { companyId, status: "ACTIVE" }, select: { id: true, user: { select: { name: true, email: true } } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 25 }),
      tx.marketingCampaign.count({ where: { AND: [where, { status: "ACTIVE" }] } }),
      tx.marketingCampaign.aggregate({ where: { AND: [where, { status: { notIn: ["COMPLETED", "ARCHIVED"] } }] }, _sum: { budgetCents: true } }),
      tx.emailDelivery.count({ where: { companyId, sequence: { campaign: { is: where } } } }),
    ])
    // Match Prisma's contains/LIKE semantics using bound parameters only.
    const pattern = `%${query.search}%`
    const attributed = await tx.$queryRaw<Array<{ total: bigint | number }>>(Prisma.sql`SELECT COUNT(*) AS total FROM "LeadCapture" l WHERE l."companyId" = ${companyId} AND EXISTS (SELECT 1 FROM "MarketingCampaign" c WHERE c."companyId" = ${companyId} AND c."status" <> 'ARCHIVED' AND c."utmCampaign" = l."utmCampaign" AND (c."name" LIKE ${pattern} OR c."objective" LIKE ${pattern}))`)
    const rows = await Promise.all(campaigns.map(async campaign => {
      const [stats, readyAssets, attributedLeads, engaged, activeSequenceCount] = await Promise.all([
        tx.emailDelivery.groupBy({ by: ["status"], where: { companyId, sequence: { campaignId: campaign.id } }, _count: { _all: true } }),
        tx.marketingCampaignAsset.count({ where: { campaignId: campaign.id, status: { in: ["READY", "PUBLISHED"] } } }),
        campaign.utmCampaign ? tx.leadCapture.count({ where: { companyId, utmCampaign: campaign.utmCampaign } }) : 0,
        tx.emailSequenceEnrollment.count({ where: { sequence: { companyId, campaignId: campaign.id } } }),
        tx.emailSequence.count({ where: { companyId, campaignId: campaign.id, status: "ACTIVE" } }),
      ])
      const count = (states: string[]) => stats.filter(item => states.includes(item.status)).reduce((sum, item) => sum + item._count._all, 0)
      return { ...campaign, channels: Array.isArray(campaign.channels) ? campaign.channels.filter((item): item is string => typeof item === "string") : [],
        startAt: campaign.startAt?.toISOString() ?? null, endAt: campaign.endAt?.toISOString() ?? null, audienceLockedAt: campaign.audienceLockedAt?.toISOString() ?? null,
        createdAt: campaign.createdAt.toISOString(), updatedAt: campaign.updatedAt.toISOString(), audienceLocked: Boolean(campaign.audienceLockedAt || engaged), audienceCount: campaign._count.audiences, assetCount: campaign._count.assets, readyAssetCount: readyAssets, sequenceCount: campaign._count.sequences, activeSequenceCount,
        assets: campaign.assets.map(asset => ({ ...asset, dueAt: asset.dueAt?.toISOString() ?? null, createdAt: asset.createdAt.toISOString(), updatedAt: asset.updatedAt.toISOString() })),
        attributedLeads, deliveryStats: { total: stats.reduce((sum, item) => sum + item._count._all, 0), delivered: count(["DELIVERED", "OPENED", "CLICKED"]), opened: count(["OPENED", "CLICKED"]), clicked: count(["CLICKED"]), failed: count(["FAILED", "BOUNCED", "COMPLAINED", "SUPPRESSED"]) } }
    }))
    return { campaigns: rows, segments, sequences, members, page, pageCount, total, search: query.search, summary: { active, plannedBudget: budget._sum.budgetCents || 0, attributedLeads: Number(attributed[0]?.total || 0), deliveries } }
  }, { timeout: 15_000 })
}

export async function campaignSequences(companyId: string, input: unknown) {
  const query = campaignPageSchema.extend({ campaignId: z.string().cuid() }).parse(input)
  if (!await prisma.marketingCampaign.count({ where: { id: query.campaignId, companyId } })) throw new CampaignManagementError("Campagne introuvable")
  const where: Prisma.EmailSequenceWhereInput = { companyId, campaignId: query.campaignId, ...(query.search ? { name: { contains: query.search } } : {}) }
  return prisma.$transaction(async tx => {
    const total = await tx.emailSequence.count({ where }), pageCount = Math.max(1, Math.ceil(total / 25)), page = Math.min(query.page, pageCount)
    const items = await tx.emailSequence.findMany({ where, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: 25, skip: (page - 1) * 25, select: { id: true, name: true, status: true, _count: { select: { enrollments: true, deliveries: true } } } })
    return { total, page, pageCount, items }
  })
}

export async function campaignAssets(companyId: string, input: unknown) {
  const query = campaignPageSchema.extend({ campaignId: z.string().cuid() }).parse(input)
  if (!await prisma.marketingCampaign.count({ where: { id: query.campaignId, companyId } })) throw new CampaignManagementError("Campagne introuvable")
  const where: Prisma.MarketingCampaignAssetWhereInput = { campaignId: query.campaignId, campaign: { companyId }, ...(query.search ? { name: { contains: query.search } } : {}) }
  return prisma.$transaction(async tx => {
    const total = await tx.marketingCampaignAsset.count({ where }), pageCount = Math.max(1, Math.ceil(total / 25)), page = Math.min(query.page, pageCount)
    const rows = await tx.marketingCampaignAsset.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 25, skip: (page - 1) * 25 })
    return { total, page, pageCount, search: query.search, items: rows.map(asset => ({ ...asset, dueAt: asset.dueAt?.toISOString() ?? null, createdAt: asset.createdAt.toISOString(), updatedAt: asset.updatedAt.toISOString() })) }
  })
}

export async function campaignChoices(companyId: string, input: unknown) {
  const query = campaignPageSchema.extend({ kind: z.enum(["SEGMENT", "SEQUENCE", "MEMBER"]), campaignId: z.string().cuid().optional(), selectedId: z.string().cuid().optional(), attachedOnly: z.boolean().default(false) }).parse(input)
  if (query.attachedOnly && !query.campaignId) throw new CampaignManagementError("Campagne requise")
  return prisma.$transaction(async tx => {
    if (query.campaignId && !await tx.marketingCampaign.count({ where: { id: query.campaignId, companyId } })) throw new CampaignManagementError("Campagne introuvable")
    const paginate = async <T>(total: number, read: (skip: number) => Promise<T[]>, selected: () => Promise<T | null>, label: (item: T) => { id: string; label: string }) => {
      const pageCount = Math.max(1, Math.ceil(total / 25)), page = Math.min(query.page, pageCount)
      const items = await read((page - 1) * 25), choice = query.selectedId ? await selected() : null
      return { total, page, pageCount, items: items.map(label), selected: choice ? label(choice) : null }
    }
    if (query.kind === "SEGMENT") {
      const where = { companyId, status: "ACTIVE", ...(query.search ? { name: { contains: query.search } } : {}) }
      const include = { _count: { select: { memberships: true } } }
      return paginate(await tx.marketingSegment.count({ where }), skip => tx.marketingSegment.findMany({ where, include, skip, take: 25, orderBy: [{ name: "asc" }, { id: "asc" }] }), () => tx.marketingSegment.findFirst({ where: { id: query.selectedId, companyId }, include }), item => ({ id: item.id, label: `${item.name} · ${item._count.memberships} membre(s)` }))
    }
    if (query.kind === "MEMBER") {
      const where: Prisma.MembershipWhereInput = { companyId, status: "ACTIVE", ...(query.search ? { user: { OR: [{ name: { contains: query.search } }, { email: { contains: query.search } }] } } : {}) }
      const include = { user: { select: { name: true, email: true } } }
      return paginate(await tx.membership.count({ where }), skip => tx.membership.findMany({ where, include, skip, take: 25, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }), () => tx.membership.findFirst({ where: { id: query.selectedId, companyId }, include }), item => ({ id: item.id, label: item.user.name || item.user.email || "Membre" }))
    }
    const where: Prisma.EmailSequenceWhereInput = { companyId, status: query.attachedOnly ? "ACTIVE" : { not: "ARCHIVED" }, ...(query.search ? { name: { contains: query.search } } : {}), ...(query.attachedOnly ? { campaignId: query.campaignId } : query.campaignId ? { OR: [{ campaignId: null }, { campaignId: query.campaignId }] } : {}) }
    return paginate(await tx.emailSequence.count({ where }), skip => tx.emailSequence.findMany({ where, skip, take: 25, orderBy: [{ name: "asc" }, { id: "asc" }] }), () => tx.emailSequence.findFirst({ where: { id: query.selectedId, companyId, ...(query.campaignId ? { OR: [{ campaignId: null }, { campaignId: query.campaignId }] } : {}) } }), item => ({ id: item.id, label: `${item.name} · ${item.status}` }))
  })
}
