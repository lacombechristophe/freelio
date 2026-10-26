import { recommendServiceAssignee, serviceRoutingTags } from "@/lib/operations/service-routing"
import prisma from "@/lib/prisma"

export async function getServiceRoutingRecommendation(companyId: string, ticketId: string) {
  const activeStatuses = ["OPEN", "QUALIFIED", "PLANNED", "WAITING"]
  const [ticket, members] = await Promise.all([
    prisma.serviceTicket.findFirst({
      where: { id: ticketId, companyId },
      select: {
        id: true,
        status: true,
        type: true,
        priority: true,
        requiredSkill: true,
        territory: true,
        site: { select: { city: true } },
        equipment: { select: { category: true } },
      },
    }),
    prisma.membership.findMany({
      where: { companyId, status: "ACTIVE", role: { in: ["OWNER", "ADMIN", "SERVICE", "TECHNICIAN"] } },
      select: {
        id: true,
        role: true,
        serviceAvailable: true,
        serviceTicketCapacity: true,
        serviceSkills: true,
        serviceTerritories: true,
        _count: { select: { assignedTickets: { where: { id: { not: ticketId }, status: { in: activeStatuses } } } } },
      },
    }),
  ])
  if (!ticket) throw new Error("Ticket introuvable")
  if (["RESOLVED", "CLOSED", "MERGED"].includes(ticket.status)) throw new Error("Un ticket résolu, clos ou fusionné ne peut pas être réaffecté")
  const requiredSkill = ticket.requiredSkill || ticket.equipment?.category || ticket.type
  const territory = ticket.territory || ticket.site?.city || null
  const recommendation = recommendServiceAssignee(
    { requiredSkill, territory, priority: ticket.priority },
    members.map((member) => ({
      id: member.id,
      role: member.role,
      available: member.serviceAvailable,
      capacity: member.serviceTicketCapacity,
      activeTickets: member._count.assignedTickets,
      skills: serviceRoutingTags(member.serviceSkills),
      territories: serviceRoutingTags(member.serviceTerritories),
    })),
  )
  return { recommendation, requiredSkill, territory }
}
