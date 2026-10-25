"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { withAuth } from "@/lib/auth-wrapper"
import { calculateLeadScore, leadMatchesSegment, type SegmentFilters } from "@/lib/marketing/intelligence"
import prisma from "@/lib/prisma"
import { withProcessorLease } from "@/lib/processing/lease"
import { logAction } from "@/lib/audit"

const ruleSchema = z.object({ name: z.string().trim().min(2).max(120), field: z.enum(["status", "source", "city", "projectType", "marketingOptIn", "email", "phone"]), operator: z.enum(["EQUALS", "NOT_EQUALS", "CONTAINS", "EXISTS"]), value: z.string().trim().max(120).default(""), points: z.coerce.number().int().min(-100).max(100) })
const filtersSchema = z.object({ status: z.string().trim().max(120).optional(), source: z.string().trim().max(120).optional(), marketingOptIn: z.boolean().optional(), cityContains: z.string().trim().max(120).optional(), projectTypeContains: z.string().trim().max(120).optional(), minScore: z.number().int().min(-100).max(200).optional(), maxScore: z.number().int().min(-100).max(200).optional(), createdWithinDays: z.number().int().min(1).max(3650).optional() }).refine((value) => value.minScore === undefined || value.maxScore === undefined || value.minScore <= value.maxScore, { message: "Le score minimum doit être inférieur au maximum" })
const segmentSchema = z.object({ name: z.string().trim().min(2).max(120), description: z.string().trim().max(500).optional(), kind: z.enum(["ACTIVE", "STATIC"]), filters: filtersSchema })
const idSchema = z.string().cuid()
const pageSchema = z.object({ page: z.coerce.number().int().min(1).max(100_000).default(1), pageSize: z.coerce.number().int().min(10).max(100).default(50), search: z.string().trim().max(120).default("") })
const leadSelect = { id: true, firstName: true, lastName: true, email: true, phone: true, status: true, source: true, city: true, projectType: true, marketingOptIn: true, score: true, scoreBreakdown: true, scoreUpdatedAt: true, createdAt: true } as const

export async function updateLeadScoringRule(ruleId: string, input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const id = idSchema.parse(ruleId), data = ruleSchema.extend({ expectedUpdatedAt: z.coerce.date() }).parse(input)
    const { expectedUpdatedAt, ...change } = data
    const result = await prisma.leadScoringRule.updateMany({ where: { id, companyId, status: "ACTIVE", updatedAt: expectedUpdatedAt }, data: change })
    if (result.count !== 1) throw new Error("Cette règle a changé ou a été archivée ; actualisez avant de la modifier")
    await logAction({ userId, action: "UPDATE_LEAD_SCORING_RULE", resource: "LEAD_SCORING_RULE", resourceId: id, payload: change })
    revalidatePath("/dashboard/marketing")
    return { success: true as const }
  }, "automation.write")
}

export async function updateMarketingSegment(segmentId: string, input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const id = idSchema.parse(segmentId), data = segmentSchema.extend({ expectedUpdatedAt: z.coerce.date() }).parse(input)
    const result = await prisma.marketingSegment.updateMany({ where: { id, companyId, kind: data.kind, status: "ACTIVE", updatedAt: data.expectedUpdatedAt, campaigns: { none: { status: "ACTIVE" } } }, data: { name: data.name, description: data.description || null, filters: data.filters, lastBuiltAt: null } })
    if (result.count !== 1) throw new Error("Ce segment a changé, est archivé ou appartient à une campagne active ; actualisez ou mettez la campagne en pause")
    // A segment's kind is its membership contract; duplicate to change it.
    await logAction({ userId, action: "UPDATE_MARKETING_SEGMENT", resource: "MARKETING_SEGMENT", resourceId: id, payload: { name: data.name, filters: data.filters } })
    revalidatePath("/dashboard/marketing")
    return { success: true as const }
  }, "automation.write")
}

export async function updateMarketingObjectStatus(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = z.object({ id: idSchema, kind: z.enum(["RULE", "SEGMENT"]), status: z.enum(["ACTIVE", "ARCHIVED"]), expectedUpdatedAt: z.coerce.date() }).parse(input)
    const result = data.kind === "RULE"
      ? await prisma.leadScoringRule.updateMany({ where: { id: data.id, companyId, updatedAt: data.expectedUpdatedAt }, data: { status: data.status } })
      : await prisma.marketingSegment.updateMany({ where: { id: data.id, companyId, updatedAt: data.expectedUpdatedAt, ...(data.status === "ARCHIVED" ? { campaigns: { none: { status: "ACTIVE" } } } : {}) }, data: { status: data.status } })
    if (result.count !== 1) throw new Error("Cet objet a changé ou reste utilisé par une campagne active")
    await logAction({ userId, action: "UPDATE_MARKETING_OBJECT_STATUS", resource: data.kind, resourceId: data.id, payload: { status: data.status } })
    revalidatePath("/dashboard/marketing")
    return { success: true as const }
  }, "automation.write")
}

export async function duplicateMarketingObject(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = z.object({ id: idSchema, kind: z.enum(["RULE", "SEGMENT"]), name: z.string().trim().min(2).max(120), expectedUpdatedAt: z.coerce.date() }).parse(input)
    const result = await prisma.$transaction(async (tx) => {
      if (data.kind === "RULE") {
        const source = await tx.leadScoringRule.findFirstOrThrow({ where: { id: data.id, companyId, updatedAt: data.expectedUpdatedAt } })
        return tx.leadScoringRule.create({ data: { companyId, name: data.name, field: source.field, operator: source.operator, value: source.value, points: source.points } })
      }
      const source = await tx.marketingSegment.findFirstOrThrow({ where: { id: data.id, companyId, updatedAt: data.expectedUpdatedAt } })
      const copy = await tx.marketingSegment.create({ data: { companyId, name: data.name, description: source.description, kind: source.kind, filters: filtersSchema.parse(source.filters) } })
      if (source.kind === "STATIC") {
        let after: string | undefined
        while (true) {
          const members = await tx.marketingSegmentMember.findMany({ where: { segmentId: source.id, leadCapture: { companyId }, ...(after ? { id: { gt: after } } : {}) }, orderBy: { id: "asc" }, take: 400, select: { id: true, leadCaptureId: true } })
          if (!members.length) break
          await tx.marketingSegmentMember.createMany({ data: members.map(({ leadCaptureId }) => ({ segmentId: copy.id, leadCaptureId })) })
          after = members[members.length - 1].id
        }
      }
      return copy
    }, { isolationLevel: "Serializable", timeout: 120_000 })
    await logAction({ userId, action: "DUPLICATE_MARKETING_OBJECT", resource: data.kind, resourceId: result.id, payload: { sourceId: data.id } })
    revalidatePath("/dashboard/marketing")
    return { success: true as const, id: result.id }
  }, "automation.write")
}

export async function updateStaticSegmentMembers(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = z.object({ segmentId: idSchema, operation: z.enum(["ADD", "REMOVE"]), leadIds: z.array(idSchema).min(1).max(500) }).parse(input)
    const ids = [...new Set(data.leadIds)]
    await prisma.$transaction(async (tx) => {
      const locked = await tx.marketingSegment.updateMany({ where: { id: data.segmentId, companyId, kind: "STATIC", status: "ACTIVE", campaigns: { none: { status: "ACTIVE" } } }, data: { lastBuiltAt: new Date() } })
      if (locked.count !== 1) throw new Error("Liste statique introuvable, archivée ou utilisée par une campagne active")
      if (await tx.leadCapture.count({ where: { companyId, id: { in: ids } } }) !== ids.length) throw new Error("Un prospect est introuvable dans cette société")
      if (data.operation === "REMOVE") await tx.marketingSegmentMember.deleteMany({ where: { segmentId: data.segmentId, leadCaptureId: { in: ids } } })
      else {
        const existing = await tx.marketingSegmentMember.findMany({ where: { segmentId: data.segmentId, leadCaptureId: { in: ids } }, select: { leadCaptureId: true } })
        const existingIds = new Set(existing.map((item) => item.leadCaptureId))
        const additions = ids.filter((id) => !existingIds.has(id))
        if (additions.length) await tx.marketingSegmentMember.createMany({ data: additions.map((leadCaptureId) => ({ segmentId: data.segmentId, leadCaptureId })) })
      }
    })
    await logAction({ userId, action: "UPDATE_STATIC_SEGMENT_MEMBERS", resource: "MARKETING_SEGMENT", resourceId: data.segmentId, payload: { operation: data.operation, leadIds: ids } })
    revalidatePath("/dashboard/marketing")
    return { success: true as const }
  }, "automation.write")
}

export async function getMarketingLeadPage(input: unknown = {}) {
  return withAuth(async ({ companyId }) => {
    const data = pageSchema.parse(input)
    const where = { companyId, status: { notIn: ["ARCHIVED", "SPAM"] }, ...(data.search ? { OR: ["firstName", "lastName", "email", "city"].map((field) => ({ [field]: { contains: data.search } })) } : {}) }
    const [rows, total] = await prisma.$transaction([prisma.leadCapture.findMany({ where, select: leadSelect, orderBy: [{ score: "desc" }, { id: "asc" }], take: data.pageSize, skip: (data.page - 1) * data.pageSize }), prisma.leadCapture.count({ where })])
    return { rows, total, page: data.page, pageSize: data.pageSize }
  }, "automation.read")
}

export async function getSegmentMemberPage(segmentId: string, input: unknown = {}) {
  return withAuth(async ({ companyId }) => {
    const id = idSchema.parse(segmentId), data = pageSchema.parse(input)
    await prisma.marketingSegment.findFirstOrThrow({ where: { id, companyId } })
    const where = { segmentId: id, leadCapture: { companyId, ...(data.search ? { OR: ["firstName", "lastName", "email"].map((field) => ({ [field]: { contains: data.search } })) } : {}) } }
    const [rows, total] = await prisma.$transaction([prisma.marketingSegmentMember.findMany({ where, include: { leadCapture: { select: leadSelect } }, orderBy: [{ addedAt: "desc" }, { id: "asc" }], take: data.pageSize, skip: (data.page - 1) * data.pageSize }), prisma.marketingSegmentMember.count({ where })])
    return { rows, total, page: data.page, pageSize: data.pageSize }
  }, "automation.read")
}

export async function previewMarketingSegment(input: unknown) {
  return withAuth(async ({ companyId }) => {
    const filters = filtersSchema.parse(input), at = new Date()
    let after: string | undefined, examined = 0, matched = 0
    const sample: Array<{ id: string; firstName: string; lastName: string; score: number }> = []
    while (true) {
      const batch = await prisma.leadCapture.findMany({ where: { companyId, ...(after ? { id: { gt: after } } : {}) }, orderBy: { id: "asc" }, take: 400 })
      if (!batch.length) break
      for (const lead of batch) if (leadMatchesSegment(lead, filters, at)) { matched += 1; if (sample.length < 25) sample.push({ id: lead.id, firstName: lead.firstName, lastName: lead.lastName, score: lead.score }) }
      examined += batch.length; after = batch[batch.length - 1].id
    }
    return { examined, matched, sample, computedAt: at }
  }, "automation.read")
}

export async function getMarketingIntelligenceDashboard() {
  return withAuth(async ({ companyId }) => {
    const activeLeads = { companyId, status: { notIn: ["ARCHIVED", "SPAM"] } }
    const [rules, segments, leads, total, hot, warm] = await Promise.all([
      prisma.leadScoringRule.findMany({ where: { companyId }, orderBy: { createdAt: "desc" } }),
      prisma.marketingSegment.findMany({ where: { companyId }, include: { _count: { select: { memberships: true } } }, orderBy: { updatedAt: "desc" } }),
      prisma.leadCapture.findMany({ where: activeLeads, select: leadSelect, orderBy: [{ score: "desc" }, { id: "asc" }], take: 50 }),
      prisma.leadCapture.count({ where: activeLeads }),
      prisma.leadCapture.count({ where: { ...activeLeads, score: { gte: 60 } } }),
      prisma.leadCapture.count({ where: { ...activeLeads, score: { gte: 30, lt: 60 } } }),
    ])
    return { rules, segments, leads, total, hot, warm }
  }, "automation.read")
}

export async function createLeadScoringRule(input: unknown) {
  return withAuth(async ({ companyId }) => {
    const data = ruleSchema.parse(input)
    await prisma.leadScoringRule.create({ data: { companyId, ...data } })
    revalidatePath("/dashboard/marketing")
    return { success: true as const }
  }, "automation.write")
}

export async function createMarketingSegment(input: unknown) {
  return withAuth(async ({ companyId }) => {
    const data = segmentSchema.parse(input)
    await prisma.marketingSegment.create({ data: { companyId, name: data.name, description: data.description || null, kind: data.kind, filters: data.filters } })
    revalidatePath("/dashboard/marketing")
    return { success: true as const }
  }, "automation.write")
}

export async function refreshMarketingIntelligence() {
  return withAuth(async ({ companyId }) => {
    const now = new Date()
    // Readers retain the previous complete generation until this transaction
    // commits. Keyset batches bound memory and SQL parameter counts.
    const lease = await withProcessorLease(`marketing-intelligence:${companyId}`, (control) => prisma.$transaction(async (tx) => {
      const rules = await tx.leadScoringRule.findMany({ where: { companyId, status: "ACTIVE" }, orderBy: { id: "asc" } })
      const segments = (await tx.marketingSegment.findMany({ where: { companyId, status: "ACTIVE", kind: "ACTIVE" } }))
        .map((segment) => ({ ...segment, parsedFilters: filtersSchema.parse(segment.filters) as SegmentFilters }))
      let after: string | undefined
      let scored = 0
      while (true) {
        const leads = await tx.leadCapture.findMany({ where: { companyId, ...(after ? { id: { gt: after } } : {}) }, orderBy: { id: "asc" }, take: 400 })
        if (!leads.length) break
        const groups = new Map<string, { ids: string[]; result: ReturnType<typeof calculateLeadScore> }>()
        for (const lead of leads) {
          const result = calculateLeadScore(lead, rules)
          lead.score = result.score
          const key = JSON.stringify(result)
          const group = groups.get(key) ?? { ids: [], result }
          group.ids.push(lead.id)
          groups.set(key, group)
        }
        for (const { ids, result } of groups.values()) {
          await tx.leadCapture.updateMany({ where: { companyId, id: { in: ids } }, data: { score: result.score, scoreBreakdown: result.breakdown, scoreUpdatedAt: now } })
        }
        const batchIds = leads.map((lead) => lead.id)
        for (const segment of segments) {
          const memberIds = leads.filter((lead) => leadMatchesSegment(lead, segment.parsedFilters, now)).map((lead) => lead.id)
          await tx.marketingSegmentMember.deleteMany({ where: { segmentId: segment.id, leadCaptureId: { in: batchIds, notIn: memberIds } } })
          const existing = await tx.marketingSegmentMember.findMany({ where: { segmentId: segment.id, leadCaptureId: { in: memberIds } }, select: { leadCaptureId: true } })
          const existingIds = new Set(existing.map((member) => member.leadCaptureId))
          const additions = memberIds.filter((id) => !existingIds.has(id))
          if (additions.length) await tx.marketingSegmentMember.createMany({ data: additions.map((leadCaptureId) => ({ segmentId: segment.id, leadCaptureId })) })
        }
        scored += leads.length
        after = leads[leads.length - 1].id
      }
      for (const segment of segments) await tx.marketingSegment.update({ where: { id: segment.id }, data: { lastBuiltAt: now } })
      await control.assertOwned(tx)
      return { scored, segments: segments.length }
    }, { isolationLevel: "Serializable", timeout: 120_000 }))
    if (!lease.acquired) throw new Error("Un recalcul marketing est déjà en cours")
    revalidatePath("/dashboard/marketing")
    revalidatePath("/dashboard/leads")
    return { success: true as const, ...lease.value }
  }, "automation.write")
}
