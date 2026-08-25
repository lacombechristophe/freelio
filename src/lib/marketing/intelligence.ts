import type { LeadCapture, LeadScoringRule } from "@prisma/client"
import prisma from "@/lib/prisma"

type ScorableLead = Pick<LeadCapture, "status" | "source" | "city" | "projectType" | "marketingOptIn" | "email" | "phone" | "createdAt" | "score">

function fieldValue(lead: ScorableLead, field: string) {
  if (field === "marketingOptIn") return lead.marketingOptIn ? "true" : "false"
  if (field === "email") return lead.email || ""
  if (field === "phone") return lead.phone || ""
  return String(lead[field as keyof ScorableLead] ?? "")
}

export function scoringRuleMatches(lead: ScorableLead, rule: Pick<LeadScoringRule, "field" | "operator" | "value">) {
  const current = fieldValue(lead, rule.field).toLowerCase()
  const expected = rule.value.toLowerCase()
  if (rule.operator === "EQUALS") return current === expected
  if (rule.operator === "NOT_EQUALS") return current !== expected
  if (rule.operator === "CONTAINS") return current.includes(expected)
  if (rule.operator === "EXISTS") return Boolean(current)
  return false
}

export function calculateLeadScore(lead: ScorableLead, rules: Array<Pick<LeadScoringRule, "name" | "field" | "operator" | "value" | "points">>) {
  const breakdown: Array<{ label: string; points: number }> = []
  const add = (label: string, points: number) => breakdown.push({ label, points })
  if (lead.email) add("Adresse e-mail renseignée", 10)
  if (lead.phone) add("Téléphone renseigné", 10)
  if (lead.marketingOptIn) add("Consentement marketing actif", 10)
  if (lead.status === "CONTACTED") add("Prospect contacté", 15)
  if (lead.status === "QUALIFIED") add("Prospect qualifié", 40)
  if (lead.status === "SPAM") add("Signalé comme spam", -100)
  for (const rule of rules) if (scoringRuleMatches(lead, rule)) add(rule.name, rule.points)
  return { score: Math.max(-100, Math.min(200, breakdown.reduce((sum, item) => sum + item.points, 0))), breakdown }
}

export type SegmentFilters = { status?: string; source?: string; marketingOptIn?: boolean; cityContains?: string; projectTypeContains?: string; minScore?: number; maxScore?: number; createdWithinDays?: number }

export function leadMatchesSegment(lead: ScorableLead, filters: SegmentFilters) {
  if (filters.status && lead.status !== filters.status) return false
  if (filters.source && lead.source.toLowerCase() !== filters.source.toLowerCase()) return false
  if (filters.marketingOptIn !== undefined && lead.marketingOptIn !== filters.marketingOptIn) return false
  if (filters.cityContains && !lead.city?.toLowerCase().includes(filters.cityContains.toLowerCase())) return false
  if (filters.projectTypeContains && !lead.projectType?.toLowerCase().includes(filters.projectTypeContains.toLowerCase())) return false
  if (filters.minScore !== undefined && lead.score < filters.minScore) return false
  if (filters.maxScore !== undefined && lead.score > filters.maxScore) return false
  if (filters.createdWithinDays !== undefined && lead.createdAt < new Date(Date.now() - filters.createdWithinDays * 24 * 60 * 60 * 1_000)) return false
  return true
}

export async function refreshSingleLeadIntelligence(companyId: string, leadId: string) {
  const [lead, rules, segments] = await Promise.all([
    prisma.leadCapture.findFirst({ where: { id: leadId, companyId } }),
    prisma.leadScoringRule.findMany({ where: { companyId, status: "ACTIVE" } }),
    prisma.marketingSegment.findMany({ where: { companyId, status: "ACTIVE", kind: "ACTIVE" } }),
  ])
  if (!lead) return null
  const result = calculateLeadScore(lead, rules)
  const scoredLead = { ...lead, score: result.score }
  await prisma.$transaction(async (tx) => {
    await tx.leadCapture.update({ where: { id: lead.id }, data: { score: result.score, scoreBreakdown: result.breakdown, scoreUpdatedAt: new Date() } })
    for (const segment of segments) {
      const matches = leadMatchesSegment(scoredLead, segment.filters as SegmentFilters)
      if (matches) await tx.marketingSegmentMember.upsert({ where: { segmentId_leadCaptureId: { segmentId: segment.id, leadCaptureId: lead.id } }, update: {}, create: { segmentId: segment.id, leadCaptureId: lead.id } })
      else await tx.marketingSegmentMember.deleteMany({ where: { segmentId: segment.id, leadCaptureId: lead.id } })
      await tx.marketingSegment.update({ where: { id: segment.id }, data: { lastBuiltAt: new Date() } })
    }
  })
  return result
}
