"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { withAuth } from "@/lib/auth-wrapper"
import { calculateLeadScore, leadMatchesSegment, type SegmentFilters } from "@/lib/marketing/intelligence"
import prisma from "@/lib/prisma"
import { withProcessorLease } from "@/lib/processing/lease"

const ruleSchema = z.object({ name: z.string().trim().min(2).max(120), field: z.enum(["status", "source", "city", "projectType", "marketingOptIn", "email", "phone"]), operator: z.enum(["EQUALS", "NOT_EQUALS", "CONTAINS", "EXISTS"]), value: z.string().trim().max(120).default(""), points: z.coerce.number().int().min(-100).max(100) })
const filtersSchema = z.object({ status: z.string().trim().optional(), source: z.string().trim().optional(), marketingOptIn: z.boolean().optional(), cityContains: z.string().trim().optional(), projectTypeContains: z.string().trim().optional(), minScore: z.number().int().min(-100).max(200).optional(), maxScore: z.number().int().min(-100).max(200).optional(), createdWithinDays: z.number().int().min(1).max(3650).optional() })
const segmentSchema = z.object({ name: z.string().trim().min(2).max(120), description: z.string().trim().max(500).optional(), kind: z.enum(["ACTIVE", "STATIC"]), filters: filtersSchema })

export async function getMarketingIntelligenceDashboard() {
  return withAuth(async ({ companyId }) => {
    const [rules, segments, leads] = await Promise.all([
      prisma.leadScoringRule.findMany({ where: { companyId }, orderBy: { createdAt: "desc" } }),
      prisma.marketingSegment.findMany({ where: { companyId, status: "ACTIVE" }, include: { memberships: { include: { leadCapture: { select: { id: true, firstName: true, lastName: true, email: true, score: true, status: true } } }, orderBy: { addedAt: "desc" }, take: 100 }, _count: { select: { memberships: true } } }, orderBy: { updatedAt: "desc" } }),
      prisma.leadCapture.findMany({ where: { companyId, status: { notIn: ["ARCHIVED", "SPAM"] } }, select: { id: true, firstName: true, lastName: true, email: true, phone: true, status: true, source: true, city: true, projectType: true, marketingOptIn: true, score: true, scoreBreakdown: true, scoreUpdatedAt: true, createdAt: true }, orderBy: { score: "desc" }, take: 500 }),
    ])
    return { rules, segments, leads }
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
