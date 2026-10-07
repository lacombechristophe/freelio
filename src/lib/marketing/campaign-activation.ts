import "server-only"
import { createHash } from "node:crypto"
import { Prisma } from "@prisma/client"
import { z } from "zod"
import prisma, { type TransactionClient } from "@/lib/prisma"
import { assertDemoMutationAllowed } from "@/lib/demo-policy"
import { hasPermission, normalizeCompanyRole } from "@/lib/permissions"
import { assertManualMarketingConsent, marketingAuthorizationSchema, type MarketingAuthorization } from "@/lib/communications/marketing-consent"
import { EmailPurposeError } from "@/lib/communications/email-purpose"
import { nextSequenceExecution } from "@/lib/automations/schedule"
import { withProcessorLease, type ProcessorLeaseControl } from "@/lib/processing/lease"
import { CampaignManagementError, lockCampaignAudience, campaignPageSchema } from "./campaign-management"

const id = z.string().cuid(), hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex")
const sequenceInclude = { steps: { orderBy: { position: "asc" as const } } }
type Sequence = Prisma.EmailSequenceGetPayload<{ include: typeof sequenceInclude }>
const campaignHash = (campaign: { segmentId: string | null; startAt: Date | null; endAt: Date | null }) => hash({ segmentId: campaign.segmentId, startAt: campaign.startAt, endAt: campaign.endAt })
const sequenceConfiguration = (sequence: Sequence) => ({ name: sequence.name, senderChannelId: sequence.senderChannelId, businessDaysOnly: sequence.businessDaysOnly, sendWindowStart: sequence.sendWindowStart, sendWindowEnd: sequence.sendWindowEnd, timezone: sequence.timezone,
  steps: sequence.steps.map(({ id, position, delayHours, type, subject, bodyHtml, taskTitle, taskNotes, taskPriority, pauseUntilComplete }) => ({ id, position, delayHours, type, subject, bodyHtml, taskTitle, taskNotes, taskPriority, pauseUntilComplete })) })

async function authorized(tx: TransactionClient, companyId: string, userId: string) {
  const member = await tx.membership.findUnique({ where: { companyId_userId: { companyId, userId } }, select: { status: true, role: true } })
  if (!member || member.status !== "ACTIVE" || !hasPermission(normalizeCompanyRole(member.role), "automation.write")) throw new CampaignManagementError("Droits d’activation retirés ou inaccessibles")
  return normalizeCompanyRole(member.role)
}

async function senderReady(tx: TransactionClient, companyId: string, userId: string, role: string, sequence: Sequence) {
  if (!sequence.steps.some(step => step.type === "EMAIL")) return
  if (!sequence.senderChannelId) throw new CampaignManagementError("Choisissez une boîte expéditrice dans les réglages de la séquence avant de vérifier l’audience")
  // A capture must name a real mailbox. Platform fallback does not invent one.
  const channel = await tx.communicationChannel.findFirst({ where: { id: sequence.senderChannelId, companyId, status: "ACTIVE", mailEnabled: true,
    ...(["OWNER", "ADMIN"].includes(role) ? {} : { OR: [{ visibility: "SHARED" }, { visibility: "PRIVATE", ownerUserId: userId }] }) }, select: { id: true } })
  if (!channel) throw new CampaignManagementError("Boîte expéditrice déconnectée ou inaccessible")
}

type CandidateLead = { id: string; companyId: string; email: string | null; contactId: string | null; status: string; marketingOptIn: boolean }
async function eligibility(tx: TransactionClient, companyId: string, lead: CandidateLead | null, requiresProof: boolean, frozen?: MarketingAuthorization) {
  if (!lead || lead.companyId !== companyId || ["SPAM", "ARCHIVED"].includes(lead.status)) return { reason: "PROSPECT_INDISPONIBLE", authorization: null }
  if (!z.string().email().safeParse(lead.email?.trim()).success) return { reason: "ADRESSE_INVALIDE", authorization: null }
  const email = lead.email!.trim().toLowerCase()
  if (await tx.emailSuppression.count({ where: { companyId, email, active: true } })) return { reason: "ADRESSE_BLOQUEE", authorization: null }
  if (!lead.marketingOptIn) return { reason: "CONSENTEMENT_RETIRE", authorization: null }
  if (!requiresProof) return { reason: null, authorization: null }
  if (!lead.contactId) return { reason: "PREUVE_ADRESSE_ABSENTE", authorization: null }
  try { return { reason: null, authorization: await assertManualMarketingConsent(companyId, lead.contactId, email, frozen, tx) } }
  catch (error) { if (error instanceof EmailPurposeError) return { reason: "PREUVE_ADRESSE_INVALIDE", authorization: null }; throw error }
}

export async function captureCampaignAudience(companyId: string, userId: string, input: unknown) {
  assertDemoMutationAllowed()
  const data = z.object({ campaignId: id, sequenceId: id, version: z.number().int().positive() }).parse(input)
  return prisma.$transaction(async tx => {
    const role = await authorized(tx, companyId, userId)
    const campaign = await tx.marketingCampaign.findFirst({ where: { id: data.campaignId, companyId }, include: { segment: true } })
    const sequence = await tx.emailSequence.findFirst({ where: { id: data.sequenceId, companyId, campaignId: data.campaignId, status: "ACTIVE" }, include: sequenceInclude })
    if (!campaign || !campaign.segment || campaign.segment.companyId !== companyId || campaign.segment.status !== "ACTIVE" || !sequence?.steps.length) throw new CampaignManagementError("Campagne, segment ou séquence active introuvable")
    if (!["PLANNED", "ACTIVE"].includes(campaign.status) || (campaign.endAt && campaign.endAt <= new Date())) throw new CampaignManagementError("Cette campagne ne permet pas de nouvelle activation")
    await senderReady(tx, companyId, userId, role, sequence)
    if (await tx.campaignAudience.count({ where: { companyId, campaignId: campaign.id, status: { in: ["ENROLLING", "PAUSED"] }, startedAt: { not: null } } })) throw new CampaignManagementError("Terminez ou reprenez l’activation existante avant une nouvelle vérification")
    const claim = await tx.marketingCampaign.updateMany({ where: { id: campaign.id, companyId, version: data.version }, data: { version: { increment: 1 } } })
    if (claim.count !== 1) throw new CampaignManagementError("La campagne a changé ; actualisez avant de vérifier")
    const segment = campaign.segment
    // This row is also claimed by static membership edits. Serializable reads
    // retain one complete generation while a dynamic rebuild commits atomically.
    const segmentClaim = await tx.marketingSegment.updateMany({ where: { id: segment.id, companyId, updatedAt: segment.updatedAt }, data: { updatedAt: segment.updatedAt } })
    if (segmentClaim.count !== 1) throw new CampaignManagementError("Le segment a changé pendant la vérification")
    const configuration = sequenceConfiguration(sequence), requiresProof = sequence.steps.some(step => step.type === "EMAIL")
    const audience = await tx.campaignAudience.create({ data: { companyId, campaignId: campaign.id, sequenceId: sequence.id, segmentId: segment.id, authorUserId: userId,
      campaignVersion: data.version + 1, campaignHash: campaignHash(campaign), sequenceHash: hash(configuration), configuration, segmentUpdatedAt: segment.updatedAt } })
    let after: string | undefined, total = 0, eligible = 0
    while (true) {
      const members = await tx.marketingSegmentMember.findMany({ where: { segmentId: segment.id, leadCapture: { companyId }, ...(after ? { id: { gt: after } } : {}) }, orderBy: { id: "asc" }, take: 200, include: { leadCapture: true } })
      if (!members.length) break
      const existing = new Set((await tx.emailSequenceEnrollment.findMany({ where: { sequenceId: sequence.id, leadCaptureId: { in: members.map(member => member.leadCaptureId) } }, select: { leadCaptureId: true } })).map(item => item.leadCaptureId))
      const rows: Prisma.CampaignAudienceMemberCreateManyInput[] = []
      for (const member of members) {
        const lead = member.leadCapture, assessed = existing.has(lead.id) ? { reason: "DEJA_INSCRIT", authorization: null } : await eligibility(tx, companyId, lead, requiresProof)
        if (!assessed.reason) eligible += 1
        rows.push({ audienceId: audience.id, leadCaptureId: lead.id, contactId: lead.contactId, recipientEmail: lead.email?.trim().toLowerCase() || null,
          name: `${lead.firstName} ${lead.lastName}`.trim(), authorization: assessed.authorization || Prisma.DbNull, decision: assessed.reason ? "EXCLUDED" : "ELIGIBLE", reason: assessed.reason })
      }
      await tx.campaignAudienceMember.createMany({ data: rows })
      total += rows.length; after = members[members.length - 1].id
    }
    await tx.campaignAudience.update({ where: { id: audience.id }, data: { total, eligible, excluded: total - eligible } })
    await tx.auditLog.create({ data: { userId, action: "CAPTURE_CAMPAIGN_AUDIENCE", resource: "MARKETING_CAMPAIGN", resourceId: campaign.id, payload: { companyId, audienceId: audience.id, total, eligible } } })
    return { success: true as const, audienceId: audience.id }
  }, { isolationLevel: "Serializable", timeout: 120_000 })
}

export async function changeCampaignActivation(companyId: string, userId: string, input: unknown) {
  assertDemoMutationAllowed()
  const data = z.discriminatedUnion("operation", [
    z.object({ audienceId: id, version: z.number().int().positive(), operation: z.enum(["START", "PAUSE", "RESUME"]) }),
    z.object({ audienceId: id, version: z.number().int().positive(), operation: z.literal("CLOSE"), reason: z.string().trim().min(3).max(500), confirmed: z.literal(true) }),
  ]).parse(input)
  return prisma.$transaction(async tx => {
    const role = await authorized(tx, companyId, userId)
    const audience = await tx.campaignAudience.findFirst({ where: { id: data.audienceId, companyId } })
    if (!audience || audience.version !== data.version) throw new CampaignManagementError("La vérification ou l’activation a changé ; actualisez")
    // Closing competes for the same row/version as a processor checkpoint.
    // No source configuration is needed to stop a permanently broken capture.
    if (data.operation === "CLOSE") {
      if (!["READY", "ENROLLING", "PAUSED"].includes(audience.status)) throw new CampaignManagementError("Cette inscription est déjà terminée ou close")
      const saved = await tx.campaignAudience.updateMany({ where: { id: audience.id, companyId, version: data.version, status: audience.status },
        data: { status: "CLOSED", closedAt: new Date(), closedByUserId: userId, closureReason: data.reason, version: { increment: 1 } } })
      if (saved.count !== 1) throw new CampaignManagementError("L’activation a changé ; actualisez avant de la clore")
      await tx.auditLog.create({ data: { userId, action: "CLOSE_CAMPAIGN_ACTIVATION", resource: "MARKETING_CAMPAIGN", resourceId: audience.campaignId,
        payload: { companyId, audienceId: audience.id, processed: audience.processed, remaining: audience.total - audience.processed } } })
      return { success: true as const }
    }
    const campaign = await tx.marketingCampaign.findFirst({ where: { id: audience.campaignId, companyId } })
    const sequence = await tx.emailSequence.findFirst({ where: { id: audience.sequenceId, companyId, campaignId: audience.campaignId }, include: sequenceInclude })
    if (!campaign || !sequence) throw new CampaignManagementError("Campagne ou séquence inaccessible")
    if (data.operation === "PAUSE") {
      if (audience.status !== "ENROLLING") throw new CampaignManagementError("Cette activation ne peut pas être mise en pause")
    } else {
      if ((data.operation === "START" && audience.status !== "READY") || (data.operation === "RESUME" && audience.status !== "PAUSED")) throw new CampaignManagementError("Cette activation ne permet pas cette opération")
      if (audience.campaignHash !== campaignHash(campaign) || audience.sequenceHash !== hash(sequenceConfiguration(sequence))) throw new CampaignManagementError("La configuration a changé ; une nouvelle vérification est nécessaire")
      if (!audience.startedAt) {
        if (campaign.version !== audience.campaignVersion || !await tx.marketingSegment.count({ where: { id: audience.segmentId, companyId, status: "ACTIVE", updatedAt: audience.segmentUpdatedAt } })) throw new CampaignManagementError("L’audience a changé depuis la vérification ; vérifiez de nouveau")
        if (await tx.campaignAudience.count({ where: { companyId, campaignId: campaign.id, id: { not: audience.id }, status: { in: ["ENROLLING", "PAUSED"] }, startedAt: { not: null } } })) throw new CampaignManagementError("Une activation existe déjà pour cette campagne")
      }
      if (sequence.status !== "ACTIVE") throw new CampaignManagementError("La séquence est en pause ou archivée")
      await senderReady(tx, companyId, userId, role, sequence)
      await lockCampaignAudience(tx, companyId, campaign.id, campaign.version)
    }
    const saved = await tx.campaignAudience.updateMany({ where: { id: audience.id, companyId, version: data.version, status: audience.status }, data: { status: data.operation === "PAUSE" ? "PAUSED" : "ENROLLING", authorUserId: userId, startedAt: audience.startedAt || new Date(), errorCode: null, version: { increment: 1 } } })
    if (saved.count !== 1) throw new CampaignManagementError("L’activation a changé ; actualisez")
    await tx.auditLog.create({ data: { userId, action: `${data.operation}_CAMPAIGN_ACTIVATION`, resource: "MARKETING_CAMPAIGN", resourceId: campaign.id, payload: { companyId, audienceId: audience.id } } })
    return { success: true as const }
  }, { isolationLevel: "Serializable" })
}

export async function campaignAudienceReport(companyId: string, input: unknown) {
  const data = campaignPageSchema.and(z.object({ campaignId: id, audienceId: id.optional() })).parse(input)
  return prisma.$transaction(async tx => {
    if (!await tx.marketingCampaign.count({ where: { id: data.campaignId, companyId } })) throw new CampaignManagementError("Campagne introuvable")
    const audience = await tx.campaignAudience.findFirst({ where: { companyId, campaignId: data.campaignId, ...(data.audienceId ? { id: data.audienceId } : {}) }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] })
    if (!audience) return null
    const active = await tx.campaignAudience.findFirst({ where: { companyId, campaignId: data.campaignId, status: { in: ["ENROLLING", "PAUSED"] }, startedAt: { not: null } }, select: { id: true } })
    const where = { audienceId: audience.id, ...(data.search ? { OR: [{ name: { contains: data.search } }, { recipientEmail: { contains: data.search } }] } : {}) }
    const total = await tx.campaignAudienceMember.count({ where }), pageCount = Math.max(1, Math.ceil(total / 25)), page = Math.min(data.page, pageCount)
    const rows = await tx.campaignAudienceMember.findMany({ where, orderBy: { id: "asc" }, skip: (page - 1) * 25, take: 25, select: { id: true, name: true, recipientEmail: true, decision: true, reason: true, result: true, resultReason: true } })
    return { activeAudienceId: active?.id || null, audience: { id: audience.id, status: audience.status, version: audience.version, total: audience.total, eligible: audience.eligible, excluded: audience.excluded, processed: audience.processed, enrolled: audience.enrolled, existing: audience.existing, rejected: audience.rejected, errorCode: audience.errorCode, createdAt: audience.createdAt.toISOString(), closedAt: audience.closedAt?.toISOString() || null, closureReason: audience.closureReason }, rows, total, pageCount, page }
  })
}

export async function campaignAudienceHistory(companyId: string, input: unknown) {
  const data = campaignPageSchema.and(z.object({ campaignId: id })).parse(input)
  return prisma.$transaction(async tx => {
    if (!await tx.marketingCampaign.count({ where: { id: data.campaignId, companyId } })) throw new CampaignManagementError("Campagne introuvable")
    const where = { companyId, campaignId: data.campaignId }, total = await tx.campaignAudience.count({ where })
    const pageCount = Math.max(1, Math.ceil(total / 25)), page = Math.min(data.page, pageCount)
    const rows = await tx.campaignAudience.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 25, take: 25,
      select: { id: true, createdAt: true, status: true, total: true, processed: true } })
    const active = await tx.campaignAudience.findFirst({ where: { ...where, status: { in: ["ENROLLING", "PAUSED"] }, startedAt: { not: null } }, select: { id: true } })
    return { rows: rows.map(row => ({ ...row, createdAt: row.createdAt.toISOString() })), total, pageCount, page, activeAudienceId: active?.id || null }
  })
}

async function processActivationBatch(audienceId: string, control: ProcessorLeaseControl) {
  return prisma.$transaction(async tx => {
    await control.assertOwned(tx)
    const audience = await tx.campaignAudience.findFirst({ where: { id: audienceId, status: "ENROLLING" } })
    if (!audience) return { processed: 0, enrolled: 0 }
    // Claiming the command serializes pause/resume and every checkpoint.
    const claimed = await tx.campaignAudience.updateMany({ where: { id: audience.id, version: audience.version, status: "ENROLLING" }, data: { version: { increment: 1 } } })
    if (claimed.count !== 1) return { processed: 0, enrolled: 0 }
    const pause = async (errorCode: string) => { await control.assertOwned(tx); await tx.campaignAudience.update({ where: { id: audience.id }, data: { status: "PAUSED", errorCode } }); return { processed: 0, enrolled: 0 } }
    let role: string
    try { role = await authorized(tx, audience.companyId, audience.authorUserId) } catch (error) { if (error instanceof CampaignManagementError) return pause("DROITS_RETIRES"); throw error }
    const campaign = await tx.marketingCampaign.findFirst({ where: { id: audience.campaignId, companyId: audience.companyId } })
    const sequence = await tx.emailSequence.findFirst({ where: { id: audience.sequenceId, companyId: audience.companyId, campaignId: audience.campaignId }, include: sequenceInclude })
    if (!campaign || !sequence || sequence.status !== "ACTIVE" || !["PLANNED", "ACTIVE"].includes(campaign.status) || (campaign.endAt && campaign.endAt <= new Date())) return pause("CAMPAGNE_OU_SEQUENCE_ARRETEE")
    if (audience.campaignHash !== campaignHash(campaign) || audience.sequenceHash !== hash(sequenceConfiguration(sequence))) return pause("CONFIGURATION_MODIFIEE")
    try { await senderReady(tx, audience.companyId, audience.authorUserId, role, sequence) } catch (error) { if (error instanceof CampaignManagementError) return pause("EXPEDITEUR_INDISPONIBLE"); throw error }
    await lockCampaignAudience(tx, audience.companyId, campaign.id, campaign.version)
    const sequenceClaim = await tx.emailSequence.updateMany({ where: { id: sequence.id, companyId: audience.companyId, campaignId: campaign.id, status: "ACTIVE", updatedAt: sequence.updatedAt }, data: { updatedAt: new Date() } })
    if (sequenceClaim.count !== 1) throw new CampaignManagementError("La séquence a changé pendant l’inscription")
    const rows = await tx.campaignAudienceMember.findMany({ where: { audienceId: audience.id, ...(audience.afterMemberId ? { id: { gt: audience.afterMemberId } } : {}) }, orderBy: { id: "asc" }, take: 200 })
    if (!rows.length && audience.processed < audience.total) return pause("CAPTURE_INCOMPLETE")
    let enrolled = 0, existing = 0, rejected = 0
    const requiresProof = sequence.steps.some(step => step.type === "EMAIL"), now = new Date()
    for (const row of rows) {
      let result = "EXCLUDED", resultReason = row.reason
      if (row.decision === "ELIGIBLE") {
        const occurrence = await tx.emailSequenceEnrollment.findUnique({ where: { sequenceId_leadCaptureId: { sequenceId: sequence.id, leadCaptureId: row.leadCaptureId } } })
        if (occurrence) { result = "EXISTING"; resultReason = "DEJA_INSCRIT"; existing += 1 }
        else {
          const lead = await tx.leadCapture.findFirst({ where: { id: row.leadCaptureId, companyId: audience.companyId } })
          const frozen = requiresProof ? marketingAuthorizationSchema.safeParse(row.authorization) : null
          const assessed = lead?.email?.trim().toLowerCase() !== row.recipientEmail || lead?.contactId !== row.contactId ? { reason: "ADRESSE_OU_CONTACT_MODIFIE", authorization: null }
            : requiresProof && !frozen?.success ? { reason: "PREUVE_ADRESSE_ABSENTE", authorization: null }
            : await eligibility(tx, audience.companyId, lead, requiresProof, frozen?.success ? frozen.data : undefined)
          if (assessed.reason || !lead) { result = "REJECTED"; resultReason = assessed.reason || "PROSPECT_INDISPONIBLE"; rejected += 1 }
          else {
            await tx.emailSequenceEnrollment.create({ data: { sequenceId: sequence.id, leadCaptureId: lead.id, contactId: lead.contactId, marketingAuthorization: assessed.authorization || Prisma.DbNull,
              nextStepPosition: sequence.steps[0].position, nextSendAt: nextSequenceExecution(campaign.startAt && campaign.startAt > now ? campaign.startAt : now, sequence.steps[0].delayHours, sequence) } })
            result = "CREATED"; resultReason = null; enrolled += 1
          }
        }
      }
      await tx.campaignAudienceMember.update({ where: { id: row.id }, data: { result, resultReason, processedAt: now } })
    }
    const finished = audience.processed + rows.length >= audience.total
    await control.assertOwned(tx)
    await tx.campaignAudience.update({ where: { id: audience.id }, data: { processed: { increment: rows.length }, enrolled: { increment: enrolled }, existing: { increment: existing }, rejected: { increment: rejected },
      afterMemberId: rows[rows.length - 1]?.id || audience.afterMemberId, status: finished ? "COMPLETED" : "ENROLLING", completedAt: finished ? now : null, errorCode: null } })
    await tx.auditLog.create({ data: { userId: audience.authorUserId, action: "PROCESS_CAMPAIGN_ACTIVATION_BATCH", resource: "MARKETING_CAMPAIGN", resourceId: campaign.id, payload: { companyId: audience.companyId, audienceId: audience.id, processed: rows.length, enrolled, existing, rejected } } })
    return { processed: rows.length, enrolled }
  }, { isolationLevel: "Serializable", timeout: 30_000 })
}

export async function processCampaignActivations(input: { companyId?: string; limit?: number } = {}) {
  assertDemoMutationAllowed()
  const rows = await prisma.campaignAudience.findMany({ where: { status: "ENROLLING", ...(input.companyId ? { companyId: input.companyId } : {}) }, orderBy: [{ updatedAt: "asc" }, { id: "asc" }], take: Math.min(Math.max(input.limit || 10, 1), 20), select: { id: true } })
  const summary = { examined: rows.length, processed: 0, enrolled: 0, failed: 0 }
  for (const row of rows) {
    try {
      const lease = await withProcessorLease(`campaign-activation:${row.id}`, async control => {
        try { return { ...await processActivationBatch(row.id, control), failed: 0 } }
        catch {
          await prisma.$transaction(async tx => {
            await control.assertOwned(tx)
            await tx.campaignAudience.updateMany({ where: { id: row.id, status: "ENROLLING" }, data: { status: "PAUSED", errorCode: "LOT_INTERROMPU", version: { increment: 1 } } })
          })
          return { processed: 0, enrolled: 0, failed: 1 }
        }
      })
      if (lease.acquired) { summary.processed += lease.value.processed; summary.enrolled += lease.value.enrolled; summary.failed += lease.value.failed }
    } catch {
      // Atomic batch rollback leaves the same checkpoint for a supervised retry.
      summary.failed += 1
    }
  }
  return summary
}
