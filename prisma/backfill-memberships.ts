import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  const users = await prisma.user.findMany({
    where: { companyId: { not: null } },
    select: { id: true, companyId: true },
  })

  let created = 0
  for (const user of users) {
    if (!user.companyId) continue

    const existing = await prisma.membership.findUnique({
      where: { companyId_userId: { companyId: user.companyId, userId: user.id } },
      select: { id: true },
    })

    if (existing) continue

    const companyMemberships = await prisma.membership.count({
      where: { companyId: user.companyId },
    })

    await prisma.membership.create({
      data: {
        companyId: user.companyId,
        userId: user.id,
        role: companyMemberships === 0 ? "OWNER" : "ADMIN",
        status: "ACTIVE",
      },
    })
    created += 1
  }

  console.log(`Membership backfill complete: ${created} created, ${users.length} users inspected.`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
