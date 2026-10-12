// Called only by the guarded, disposable browser recipe.
export async function seedTimeInvoiceRounding(prisma, passwordHash) {
  for (const surface of ["desktop", "mobile"]) {
    const company = await prisma.company.create({ data: { name: `Fictional exact time ${surface}`, isTvaApplicable: false } })
    const user = await prisma.user.create({ data: { companyId: company.id, email: `time-rounding-${surface}@example.test`, emailVerified: new Date(), passwordHash } })
    await prisma.membership.create({ data: { companyId: company.id, userId: user.id, role: "OWNER", status: "ACTIVE" } })
    await prisma.saasSubscription.create({ data: { companyId: company.id, plan: "RESEAU", status: "ACTIVE", seatQuantity: 10 } })
    const client = await prisma.client.create({ data: { companyId: company.id, name: "Fictional exact time customer" } })
    const project = await prisma.project.create({ data: { companyId: company.id, clientId: client.id, name: "FICTIONAL-ROUNDING-PROJECT" } })
    for (const kind of ["GROUP", "DETAIL"]) {
      for (const index of [1, 2]) await prisma.timeEntry.create({ data: { id: `ctimeround${kind.toLowerCase()}${index}${surface}`, projectId: project.id, durationSec: 60, description: `FICTIONAL-ROUND-${kind}`, date: new Date("2030-01-01") } })
    }
    await prisma.timeEntry.create({ data: { id: `ctimeroundoverflow${surface}`, projectId: project.id, durationSec: 7200, description: "FICTIONAL-ROUND-OVERFLOW", date: new Date("2030-01-01") } })
  }
}
