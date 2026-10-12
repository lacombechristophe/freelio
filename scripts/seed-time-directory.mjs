// Called by the guarded, isolated browser recipe; never seeds the hosted demo.
export async function seedTimeDirectory(prisma, passwordHash) {
  for (const surface of ["desktop", "mobile"]) {
    const company = await prisma.company.create({ data: { name: `Fictional time directory ${surface}`, serviceTimezone: "Europe/Paris" } })
    const companyId = company.id
    const user = await prisma.user.create({ data: { companyId, email: `time-directory-${surface}@example.test`, emailVerified: new Date(), passwordHash } })
    await prisma.membership.create({ data: { companyId, userId: user.id, role: "OWNER", status: "ACTIVE" } })
    await prisma.saasSubscription.create({ data: { companyId, plan: "RESEAU", status: "ACTIVE", seatQuantity: 10 } })
    const client = await prisma.client.create({ data: { companyId, name: "Fictional time directory customer" } })
    const projectId = `ctimedirectoryolder${surface}`
    await prisma.project.create({ data: { id: projectId, companyId, clientId: client.id, name: "ZZ ANCIEN CHANTIER", createdAt: new Date("2000-01-01") } })
    await prisma.project.createMany({ data: Array.from({ length: 100 }, (_, i) => ({ companyId, clientId: client.id, name: `Recent time project ${String(i).padStart(3, "0")}` })) })
    await prisma.timeEntry.create({ data: { projectId, durationSec: 60, description: "ANCIENNE-INTERVENTION-UNIQUE", date: new Date("2000-01-01") } })
    await prisma.timeEntry.createMany({ data: Array.from({ length: 500 }, () => ({ projectId, durationSec: 60, description: "RECENT-FICTIONAL-TIME", date: new Date("2026-03-29T22:00:00Z") })) })
  }
}
