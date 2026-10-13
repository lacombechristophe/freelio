export async function seedDocumentClientChoices(prisma, passwordHash) {
  for (const surface of ["desktop", "mobile"]) {
    for (const kind of ["quote", "invoice", "contract", "opportunity"]) {
      const company = await prisma.company.create({ data: { name: `Fictional document choices ${kind} ${surface}` } })
      const user = await prisma.user.create({ data: { companyId: company.id, email: `document-choice-${kind}-${surface}@example.test`, emailVerified: new Date(), passwordHash } })
      await prisma.membership.create({ data: { companyId: company.id, userId: user.id, role: "OWNER", status: "ACTIVE" } })
      await prisma.saasSubscription.create({ data: { companyId: company.id, plan: "RESEAU", status: "ACTIVE", seatQuantity: 10 } })
      await prisma.client.createMany({ data: Array.from({ length: 1000 }, (_, index) => ({ companyId: company.id, name: `Client ${String(index).padStart(4, "0")}` })) })
      const client = await prisma.client.create({ data: { id: `cdocchoicelast${kind}${surface}`, companyId: company.id, name: "ZZ DERNIER CLIENT" } })
      const base = { id: `cdocchoiceold${kind}${surface}`, companyId: company.id, clientId: client.id, number: "FICTIONAL-CHOICE-OLD" }
      const line = { label: "Fictional kept line", quantity: 1, unitPriceCents: 10000, tvaRate: 20 }
      const totals = { totalHtCents: 10000, totalTvaCents: 2000, totalTtcCents: 12000 }
      if (kind === "quote") await prisma.quote.create({ data: { ...base, object: "EXISTING-LAST-CLIENT-DOCUMENT", validUntil: new Date("2030-01-01"), versions: { create: { version: 1, ...totals, sections: { create: { lines: { create: line } } } } } } })
      if (kind === "invoice") await prisma.invoice.create({ data: { ...base, object: "EXISTING-LAST-CLIENT-DOCUMENT", dueDate: new Date("2030-01-01"), ...totals, lines: { create: line } } })
      if (kind === "contract") await prisma.contract.create({ data: { ...base, title: "EXISTING-LAST-CLIENT-DOCUMENT", content: "<p>Fictional kept contract content.</p>", validUntil: new Date("2030-01-01") } })
      if (kind === "opportunity") {
        const pipeline = await prisma.pipeline.create({ data: { companyId: company.id, name: "Fictional document choice pipeline", isDefault: true, stages: [{ id: "PROSPECT", title: "Prospect" }] } })
        await prisma.opportunity.create({ data: { id: base.id, pipelineId: pipeline.id, clientId: client.id, title: "EXISTING-LAST-CLIENT-DOCUMENT", status: "PROSPECT", valueCents: 10000, probability: 30, closeDate: new Date("2030-01-01") } })
      }
    }
  }
}
