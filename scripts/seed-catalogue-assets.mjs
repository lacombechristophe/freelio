export async function seedCatalogueAssets(prisma, passwordHash) {
  for (const surface of ["desktop", "mobile"]) {
    for (const kind of ["catalogue", "assets", "analytics", "opportunity"]) {
      const company = await prisma.company.create({ data: { name: `Fictional ${kind} recipe ${surface}` } })
      const companyId = company.id
      const roles = kind === "analytics" ? ["OWNER", "TECHNICIAN", "SERVICE", "VIEWER", "SALES", "ACCOUNTING"] : kind === "opportunity" ? ["OWNER", "ADMIN", "SALES", "VIEWER"] : ["OWNER"]
      const localAgency = await prisma.agency.create({ data: { companyId, code: "LOCAL", name: "Fictional local agency", isDefault: true } })
      const otherAgency = await prisma.agency.create({ data: { companyId, code: "OTHER", name: "Fictional other agency" } })
      for (const role of roles) {
        const user = await prisma.user.create({ data: { companyId, email: `${kind}-${role.toLowerCase()}-${surface}@example.test`, name: `Fictional ${kind} reader`, emailVerified: new Date(), passwordHash } })
        const membership = await prisma.membership.create({ data: { companyId, userId: user.id, role, status: "ACTIVE" } })
        await prisma.agencyMembership.create({ data: { agencyId: localAgency.id, membershipId: membership.id } })
      }
      await prisma.saasSubscription.create({ data: { companyId, plan: "RESEAU", status: "ACTIVE", seatQuantity: 30 } })
      if (kind === "opportunity") {
        const client = await prisma.client.create({ data: { companyId, name: "Fictional opportunity client", relationScore: 37, totalRevenueCents: 45678, totalUnpaidCents: 9876, renewalAmountCents: 12345 } })
        const pipeline = await prisma.pipeline.create({ data: { companyId, name: "Fictional opportunity pipeline", stages: [{ id: "PROSPECT", title: "Prospect" }, { id: "WON", title: "Gagné" }] } })
        await prisma.opportunity.create({ data: { id: `copportunity${surface}local`, pipelineId: pipeline.id, clientId: client.id, title: "Fictional scoped opportunity", status: "PROSPECT" } })
        let localProjectId
        for (const [agency, suffix] of [[localAgency, "local"], [otherAgency, "other"]]) {
          const project = await prisma.project.create({ data: { companyId, clientId: client.id, agencyId: agency.id, name: `Fictional ${suffix} opportunity project` } })
          await prisma.quote.create({ data: { companyId, clientId: client.id, projectId: project.id, number: `OPP-${suffix.toUpperCase()}`, object: `Fictional ${suffix} opportunity quote` } })
          if (suffix === "local") localProjectId = project.id
        }
        const foreign = await prisma.company.create({ data: { name: `Fictional foreign opportunity company ${surface}` } })
        const foreignClient = await prisma.client.create({ data: { companyId: foreign.id, name: "Fictional foreign opportunity client" } })
        await prisma.quote.create({ data: { companyId: foreign.id, clientId: client.id, projectId: localProjectId, number: "OPP-FOREIGN", object: "Fictional inconsistent foreign quote" } })
        await prisma.opportunity.create({ data: { id: `copportunity${surface}inconsistent`, pipelineId: pipeline.id, clientId: foreignClient.id, title: "Fictional inconsistent opportunity", status: "PROSPECT" } })
        continue
      }
      if (kind === "catalogue") {
        await prisma.product.createMany({ data: Array.from({ length: 601 }, (_, index) => ({ companyId, sku: `CAT-${String(index).padStart(3, "0")}`, label: `Fictional catalogue ${String(index).padStart(3, "0")}` })) })
        const parent = await prisma.product.findFirstOrThrow({ where: { companyId, sku: "CAT-600" } })
        await prisma.productOptionGroup.create({ data: { companyId, productId: parent.id, name: "Fictional option" } })
        await prisma.product.create({ data: { companyId, sku: "CAT-VARIANT", label: "ZZZ Fictional variant", kind: "VARIANT", parentProductId: parent.id, variantLabel: "Distinctive distant variant" } })
        await prisma.product.create({ data: { companyId, sku: "CAT-INACTIVE", label: "ZZZ Fictional inactive", active: false } })
      } else {
        const client = await prisma.client.create({ data: { companyId, name: "Fictional assets client", relationScore: 37 } })
        if (kind === "assets") {
          const ids = Array.from({ length: 201 }, (_, index) => `cassets${surface}${String(index).padStart(12, "0")}`)
          await prisma.customerSite.createMany({ data: ids.map((id, index) => ({ id, companyId, clientId: client.id, agencyId: localAgency.id, label: `Fictional site ${String(index).padStart(3, "0")}`, address1: `Fictional address ${index}`, updatedAt: new Date(Date.UTC(2020, 0, 201 - index)) })) })
          await prisma.equipment.createMany({ data: Array.from({ length: 301 }, (_, index) => ({ companyId, siteId: ids[index % ids.length], label: `Fictional equipment ${String(index).padStart(3, "0")}`, serialNumber: `ASSET-${String(index).padStart(3, "0")}`, updatedAt: new Date(Date.UTC(2020, 0, 301 - index)) })) })
          const otherSite = await prisma.customerSite.create({ data: { companyId, clientId: client.id, agencyId: otherAgency.id, label: "Fictional other agency site", address1: "Fictional address" } })
          await prisma.equipment.create({ data: { companyId, siteId: otherSite.id, label: "Fictional other agency equipment" } })
        } else {
          await prisma.customerHealthSnapshot.createMany({ data: [
            { companyId, clientId: client.id, score: 91, status: "HEALTHY", factors: [], computedAt: new Date("2030-01-01") },
            { companyId, clientId: client.id, score: 37, status: "RISK", factors: [], computedAt: new Date("2035-01-01") },
          ] })
          await prisma.automationWorkflow.create({ data: { companyId, name: "Fictional health permission simulation", trigger: "CUSTOMER_HEALTH_CHANGED", conditions: { healthScoreBelow: 50, healthScoreDropAtLeast: 10 }, actions: [{ type: "CREATE_TASK", title: "Fictional simulated follow-up", delayHours: 0, priority: 2 }] } })
          const survey = await prisma.satisfactionSurvey.create({ data: { companyId, name: "Fictional analytics CSAT", question: "Fictional question" } })
          for (const [agency, suffix, score] of [[localAgency, "local", 5], [otherAgency, "other", 1]]) {
            const project = await prisma.project.create({ data: { companyId, clientId: client.id, agencyId: agency.id, name: `Fictional ${suffix} workspace project` } })
            const amount = suffix === "local" ? 10000 : 20000
            await prisma.invoice.create({ data: { companyId, clientId: client.id, projectId: project.id, number: `WORKSPACE-${suffix}`, object: `Fictional ${suffix} workspace invoice`, status: "SENT", dueDate: new Date("2020-01-01"), totalHtCents: amount, totalTvaCents: 0, totalTtcCents: amount } })
            const site = await prisma.customerSite.create({ data: { companyId, clientId: client.id, agencyId: agency.id, label: `Fictional ${suffix} site`, address1: "Fictional address" } })
            const ticket = await prisma.serviceTicket.create({ data: { companyId, clientId: client.id, siteId: site.id, number: suffix, title: `Fictional ${suffix} ticket`, description: "Fictional ticket" } })
            await prisma.serviceTicketDiagnostic.create({ data: { companyId, ticketId: ticket.id, guideSnapshot: { name: `Fictional ${suffix} guide` }, completedStepIds: [], warrantyStatus: "UNKNOWN", symptom: "Fictional symptom", outcome: "Fictional outcome" } })
            await prisma.satisfactionRequest.create({ data: { companyId, clientId: client.id, surveyId: survey.id, serviceTicketId: ticket.id, tokenHash: `fictional-analytics-${surface}-${suffix}`, expiresAt: new Date(Date.now() + 86_400_000), respondedAt: new Date(), status: "RESPONDED", score } })
          }
        }
      }
    }
  }
}
