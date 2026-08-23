import prisma from "@/lib/prisma"

/**
 * Calculates and updates the relationship score for a client
 * Factors: 
 * - Overdue invoices: -10 per document
 * - Paid invoices: +5 per document
 * - Active projects: +10 per project
 * - Total Revenue: +1 per 100€
 */
export async function updateRelationScore(clientId: string) {
  const [overdueCount, paidCount, activeProjects, totals] = await Promise.all([
    prisma.invoice.count({ where: { clientId, status: "OVERDUE" } }),
    prisma.invoice.count({ where: { clientId, status: "PAID" } }),
    prisma.project.count({ where: { clientId, status: "ACTIVE" } }),
    prisma.invoice.aggregate({
      where: { clientId, status: "PAID" },
      _sum: { totalHtCents: true }
    })
  ])

  let score = 100 // Base score
  
  score -= overdueCount * 10
  score += paidCount * 5
  score += activeProjects * 10
  score += Math.floor((totals._sum.totalHtCents || 0) / 10000) // +1 per 100€

  // Constrain between 0 and 100
  const finalScore = Math.max(0, Math.min(100, score))

  await prisma.client.update({
    where: { id: clientId },
    data: { relationScore: finalScore }
  })

  return finalScore
}
