import type { Prisma } from "@prisma/client"

export const ticketPriorities = ["URGENT", "HIGH", "NORMAL", "LOW"] as const

// Unknown historical values remain consultable after the known priorities.
export function ticketPriorityBuckets(where: Prisma.ServiceTicketWhereInput) {
  return [
    ...ticketPriorities.map(priority => ({ AND: [where, { priority }] })),
    { AND: [where, { priority: { notIn: [...ticketPriorities] } }] },
  ] satisfies Prisma.ServiceTicketWhereInput[]
}
