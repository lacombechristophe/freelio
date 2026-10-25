import "server-only"
import { z } from "zod"
import prisma, { type TransactionClient } from "@/lib/prisma"
import { assertDemoMutationAllowed } from "@/lib/demo-policy"
import { hasPermission, normalizeCompanyRole } from "@/lib/permissions"

export class CampaignManagementError extends Error {}
export const campaignPageSchema = z.object({ page: z.number().int().min(1).max(100_000).default(1), search: z.string().trim().max(200).default("") })
export const campaignSchema = z.object({
  name: z.string().trim().min(2).max(140), objective: z.string().trim().min(2).max(180),
  channels: z.array(z.enum(["EMAIL", "SMS", "FORM", "SOCIAL", "ADS", "EVENT", "CONTENT"])).min(1).max(7),
  segmentId: z.union([z.string().cuid(), z.literal("")]).optional(), ownerMembershipId: z.union([z.string().cuid(), z.literal("")]).optional(),
  startAt: z.union([z.literal(""), z.null(), z.coerce.date()]).optional(), endAt: z.union([z.literal(""), z.null(), z.coerce.date()]).optional(),
  budgetCents: z.coerce.number().int().min(0).max(1_000_000_000).default(0), utmCampaign: z.string().trim().max(120).default(""), notes: z.string().trim().max(2_000).default(""),
}).superRefine((data, context) => {
  if (data.startAt instanceof Date && data.endAt instanceof Date && data.endAt < data.startAt) context.addIssue({ code: "custom", path: ["endAt"], message: "La fin doit être postérieure au début" })
})
const resourceFields = {
  type: z.enum(["EMAIL", "FORM", "SMS", "SOCIAL", "ADS", "EVENT", "CONTENT", "DOCUMENT", "OTHER"]), name: z.string().trim().min(2).max(160),
  ownerMembershipId: z.union([z.string().cuid(), z.literal("")]).optional(), dueAt: z.union([z.literal(""), z.null(), z.coerce.date()]).optional(),
  url: z.union([z.string().trim().url().refine(value => ["https:", "http:"].includes(new URL(value).protocol), "Utilisez une URL HTTP(S)"), z.literal("")]).optional(),
}
export const campaignAssetSchema = z.object({ campaignId: z.string().cuid(), ...resourceFields })
const revision = { id: z.string().cuid(), version: z.number().int().positive() }
const conflict = () => new CampaignManagementError("La campagne ou le livrable a changé ; actualisez avant d’enregistrer")

async function editor(tx: TransactionClient, companyId: string, userId: string) {
  const member = await tx.membership.findUnique({ where: { companyId_userId: { companyId, userId } }, select: { status: true, role: true } })
  if (!member || member.status !== "ACTIVE" || !hasPermission(normalizeCompanyRole(member.role), "automation.write")) throw new CampaignManagementError("Modification inaccessible")
}

/** Both enrollment paths claim the campaign row before adding any member. */
export async function lockCampaignAudience(tx: TransactionClient, companyId: string, campaignId: string, expectedVersion?: number) {
  const campaign = await tx.marketingCampaign.findFirst({ where: { id: campaignId, companyId } })
  if (!campaign || (expectedVersion && campaign.version !== expectedVersion)) throw conflict()
  if (!["PLANNED", "ACTIVE"].includes(campaign.status) || (campaign.endAt && campaign.endAt <= new Date())) throw new CampaignManagementError("La campagne ne permet plus de nouvelles inscriptions")
  const claimed = await tx.marketingCampaign.updateMany({ where: { id: campaignId, companyId, version: campaign.version }, data: { version: { increment: 1 }, audienceLockedAt: campaign.audienceLockedAt || new Date() } })
  if (claimed.count !== 1) throw conflict()
  return campaign.version + 1
}

export async function editCampaign(companyId: string, userId: string, input: unknown) {
  assertDemoMutationAllowed()
  const data = campaignSchema.and(z.object(revision)).parse(input)
  return prisma.$transaction(async tx => {
    await editor(tx, companyId, userId)
    const original = await tx.marketingCampaign.findFirst({ where: { id: data.id, companyId } })
    if (!original) throw new CampaignManagementError("Campagne introuvable")
    if (["COMPLETED", "ARCHIVED"].includes(original.status)) throw new CampaignManagementError("Cette campagne est terminée ou archivée")
    const claimed = await tx.marketingCampaign.updateMany({ where: { id: data.id, companyId, version: data.version }, data: { version: { increment: 1 } } })
    if (claimed.count !== 1) throw conflict()
    const locked = original.audienceLockedAt || await tx.emailSequenceEnrollment.count({ where: { sequence: { companyId, campaignId: original.id } } })
    if (locked && (data.segmentId || null) !== original.segmentId) throw new CampaignManagementError("L’audience est verrouillée après inscription ; créez une autre campagne")
    if (data.segmentId && data.segmentId !== original.segmentId && !await tx.marketingSegment.count({ where: { id: data.segmentId, companyId, status: "ACTIVE" } })) throw new CampaignManagementError("Segment introuvable")
    if (data.ownerMembershipId && data.ownerMembershipId !== original.ownerMembershipId && !await tx.membership.count({ where: { id: data.ownerMembershipId, companyId, status: "ACTIVE" } })) throw new CampaignManagementError("Responsable introuvable")
    await tx.marketingCampaign.update({ where: { id: original.id }, data: { name: data.name, objective: data.objective, channels: data.channels, segmentId: data.segmentId || null, ownerMembershipId: data.ownerMembershipId || null, startAt: data.startAt instanceof Date ? data.startAt : null, endAt: data.endAt instanceof Date ? data.endAt : null, budgetCents: data.budgetCents, utmCampaign: data.utmCampaign || null, notes: data.notes || null } })
    await tx.auditLog.create({ data: { userId, action: "EDIT_MARKETING_CAMPAIGN", resource: "MARKETING_CAMPAIGN", resourceId: original.id, payload: { companyId, version: data.version + 1 } } })
    return { success: true as const }
  })
}

export async function editCampaignAsset(companyId: string, userId: string, input: unknown) {
  assertDemoMutationAllowed()
  const data = z.object({ ...revision, ...resourceFields }).parse(input)
  return prisma.$transaction(async tx => {
    await editor(tx, companyId, userId)
    const original = await tx.marketingCampaignAsset.findFirst({ where: { id: data.id, campaign: { companyId } }, include: { campaign: { select: { status: true } } } })
    if (!original) throw new CampaignManagementError("Livrable introuvable")
    if (["COMPLETED", "ARCHIVED"].includes(original.campaign.status)) throw new CampaignManagementError("Cette campagne est terminée ou archivée")
    if (data.ownerMembershipId && data.ownerMembershipId !== original.ownerMembershipId && !await tx.membership.count({ where: { id: data.ownerMembershipId, companyId, status: "ACTIVE" } })) throw new CampaignManagementError("Responsable introuvable")
    const saved = await tx.marketingCampaignAsset.updateMany({ where: { id: original.id, version: data.version, campaign: { companyId, status: { notIn: ["COMPLETED", "ARCHIVED"] } } }, data: { name: data.name, type: data.type, ownerMembershipId: data.ownerMembershipId || null, dueAt: data.dueAt instanceof Date ? data.dueAt : null, url: data.url || null, version: { increment: 1 } } })
    if (saved.count !== 1) throw conflict()
    await tx.auditLog.create({ data: { userId, action: "EDIT_MARKETING_CAMPAIGN_ASSET", resource: "MARKETING_CAMPAIGN_ASSET", resourceId: original.id, payload: { companyId, campaignId: original.campaignId, version: data.version + 1 } } })
    return { success: true as const }
  })
}
