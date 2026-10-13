export async function seedPipelineRelations(prisma, passwordHash) {
  for (const surface of ["desktop", "mobile"]) {
    const company = await prisma.company.create({ data: { name: `Fictional pipeline relations ${surface}` } })
    const foreign = await prisma.company.create({ data: { name: `Fictional foreign pipeline relations ${surface}` } })
    await prisma.saasSubscription.create({ data: { companyId: company.id, plan: "RESEAU", status: "ACTIVE", seatQuantity: 10 } })
    const user = await prisma.user.create({ data: { companyId: company.id, email: `pipeline-relations-${surface}@example.test`, emailVerified: new Date(), passwordHash } })
    await prisma.membership.create({ data: { companyId: company.id, userId: user.id, role: "OWNER", status: "ACTIVE" } })
    const foreignUser = await prisma.user.create({ data: { name: "PIPELINE-FOREIGN-OWNER", email: `pipeline-foreign-owner-${surface}@example.test` } })
    const foreignOwner = await prisma.membership.create({ data: { companyId: foreign.id, userId: foreignUser.id, role: "SALES", status: "ACTIVE" } })
    const client = await prisma.client.create({ data: { companyId: company.id, name: "Fictional coherent pipeline client" } })
    const foreignClient = await prisma.client.create({ data: { companyId: foreign.id, name: "PIPELINE-FOREIGN-CLIENT" } })
    const pipeline = await prisma.pipeline.create({ data: { companyId: company.id, name: "SCOPED-PIPELINE", isDefault: true, stages: [{ id: "PROSPECT", title: "Prospect", probability: 20 }] } })
    const base = { pipelineId: pipeline.id, clientId: client.id, status: "PROSPECT", valueCents: 12345, probability: 30 }
    await prisma.opportunity.createMany({ data: [
      { ...base, id: `cpipelinerelationown${surface}`, title: "PIPELINE-COHERENT-DEAL" },
      { ...base, id: `cpipelinerelationclient${surface}`, title: "PIPELINE-FOREIGN-CLIENT-DEAL", clientId: foreignClient.id },
      { ...base, id: `cpipelinerelationowner${surface}`, title: "PIPELINE-FOREIGN-OWNER-DEAL", ownerMembershipId: foreignOwner.id },
    ] })
  }
}
