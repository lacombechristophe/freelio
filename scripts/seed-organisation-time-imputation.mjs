// Called only by the guarded, disposable browser recipe.
export async function seedOrganisationTimeImputation(prisma, passwordHash) {
  for (const surface of ["desktop", "mobile"]) {
    const company = await prisma.company.create({ data: { name: `Fictional task imputation ${surface}` } })
    const user = await prisma.user.create({ data: { companyId: company.id, email: `task-time-${surface}@example.test`, emailVerified: new Date(), passwordHash } })
    await prisma.membership.create({ data: { companyId: company.id, userId: user.id, role: "OWNER", status: "ACTIVE" } })
    await prisma.saasSubscription.create({ data: { companyId: company.id, plan: "RESEAU", status: "ACTIVE", seatQuantity: 10 } })
    const customer = await prisma.client.create({ data: { companyId: company.id, name: "Fictional task customer" } })
    const other = await prisma.client.create({ data: { companyId: company.id, name: "Fictional other task customer" } })
    const project = await prisma.project.create({ data: { companyId: company.id, clientId: customer.id, name: "FICTIONAL-TASK-TIME-PROJECT" } })
    for (const [kind, estimateMin, clientId] of [["ONCE", 60, customer.id], ["DURATION", 0, customer.id], ["RELATION", 60, other.id]]) {
      await prisma.organisationTask.create({ data: { id: `ctasktime${kind.toLowerCase()}${surface}`, companyId: company.id, projectId: project.id, clientId, title: `FICTIONAL-TASK-${kind}`, estimateMin } })
    }
  }
}
