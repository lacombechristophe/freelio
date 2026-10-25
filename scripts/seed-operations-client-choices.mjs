export async function seedOperationsClientChoices(prisma, passwordHash) {
  for (const surface of ["desktop", "mobile"]) {
    for (const kind of ["site", "ticket", "maintenance", "order"]) {
      const company = await prisma.company.create({ data: { name: `Fictional Operations choices ${kind} ${surface}`, isTvaApplicable: true } })
      const other = await prisma.company.create({ data: { name: `Fictional foreign Operations choices ${kind} ${surface}` } })
      await prisma.saasSubscription.create({ data: { companyId: company.id, plan: "RESEAU", status: "ACTIVE", seatQuantity: 10 } })
      const user = await prisma.user.create({ data: { companyId: company.id, email: `operations-choice-${kind}-${surface}@example.test`, emailVerified: new Date(), passwordHash } })
      await prisma.membership.create({ data: { companyId: company.id, userId: user.id, role: "OWNER", status: "ACTIVE" } })
      await prisma.client.createMany({ data: Array.from({ length: 500 }, (_, index) => ({
        ...(index === 0 ? { id: `copschoicefirst${kind}${surface}` } : {}), companyId: company.id, name: `Client ${String(index).padStart(3, "0")}`,
      })) })
      const last = await prisma.client.create({ data: { id: `copschoicelast${kind}${surface}`, companyId: company.id, name: "ZZ DERNIER CLIENT" } })
      await prisma.customerSite.create({ data: { id: `copschoicesite${kind}${surface}`, companyId: company.id, clientId: last.id, label: "Fictional last client site", address1: "12 rue fictive" } })
      await prisma.client.create({ data: { companyId: other.id, name: "FOREIGN-OPERATIONS-CHOICE" } })
    }
  }
}
