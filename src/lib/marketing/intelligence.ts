import prisma from "@/lib/prisma"
import { calculateLeadScore, leadMatchesSegment, type SegmentFilters } from "./intelligence-rules"
export { calculateLeadScore, leadMatchesSegment, scoringRuleMatches, type SegmentFilters } from "./intelligence-rules"

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
