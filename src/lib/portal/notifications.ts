import "server-only"

import prisma from "@/lib/prisma"

export async function notifyPortalTeam(companyId: string, title: string, message: string) {
  const memberships = await prisma.membership.findMany({
    where: { companyId, status: "ACTIVE", role: { in: ["OWNER", "ADMIN", "SALES", "OPERATIONS", "SERVICE"] } },
    select: { userId: true },
  })
  if (!memberships.length) return
  await prisma.notification.createMany({
    data: memberships.map(({ userId }) => ({ userId, type: "PORTAL", title, message })),
  })
}
