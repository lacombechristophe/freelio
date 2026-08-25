"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { withAuth } from "@/lib/auth-wrapper"
import { calculateLeadScore, leadMatchesSegment, type SegmentFilters } from "@/lib/marketing/intelligence"
import prisma from "@/lib/prisma"

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
    const [rules, leads] = await Promise.all([
      prisma.leadScoringRule.findMany({ where: { companyId, status: "ACTIVE" } }),
      prisma.leadCapture.findMany({ where: { companyId }, take: 5_000 }),
    ])
    const now = new Date()
    for (const lead of leads) {
      const result = calculateLeadScore(lead, rules)
      await prisma.leadCapture.update({ where: { id: lead.id }, data: { score: result.score, scoreBreakdown: result.breakdown, scoreUpdatedAt: now } })
      lead.score = result.score
    }
    const segments = await prisma.marketingSegment.findMany({ where: { companyId, status: "ACTIVE", kind: "ACTIVE" } })
    for (const segment of segments) {
      const filters = filtersSchema.parse(segment.filters) as SegmentFilters
      const memberIds = leads.filter((lead) => leadMatchesSegment(lead, filters)).map((lead) => lead.id)
      await prisma.$transaction(async (tx) => {
        await tx.marketingSegmentMember.deleteMany({ where: { segmentId: segment.id, leadCaptureId: { notIn: memberIds } } })
        for (const leadCaptureId of memberIds) await tx.marketingSegmentMember.upsert({ where: { segmentId_leadCaptureId: { segmentId: segment.id, leadCaptureId } }, update: {}, create: { segmentId: segment.id, leadCaptureId } })
        await tx.marketingSegment.update({ where: { id: segment.id }, data: { lastBuiltAt: now } })
      })
    }
    revalidatePath("/dashboard/marketing")
    revalidatePath("/dashboard/leads")
    return { success: true as const, scored: leads.length, segments: segments.length }
  }, "automation.write")
}
