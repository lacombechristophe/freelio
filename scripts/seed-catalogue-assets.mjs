const RECIPE_ROLES = {
  catalogue: ["OWNER"],
  assets: ["OWNER"],
  analytics: ["OWNER", "TECHNICIAN", "SERVICE", "VIEWER", "SALES", "ACCOUNTING"],
  opportunity: ["OWNER", "ADMIN", "SALES", "VIEWER"],
  "project-readers": ["OWNER", "ADMIN", "TECHNICIAN", "SERVICE", "SALES", "ACCOUNTING", "VIEWER"],
  "contact-readers": ["OWNER", "ADMIN", "TECHNICIAN", "SERVICE", "SALES", "ACCOUNTING", "VIEWER", "OPERATIONS"],
}

export async function seedCatalogueAssets(prisma, passwordHash) {
  for (const surface of ["desktop", "mobile"]) {
    for (const [kind, roles] of Object.entries(RECIPE_ROLES)) {
      const company = await prisma.company.create({ data: { name: `Fictional ${kind} recipe ${surface}` } })
      const companyId = company.id
      const localAgency = await prisma.agency.create({ data: { companyId, code: "LOCAL", name: "Fictional local agency", isDefault: true } })
      const otherAgency = await prisma.agency.create({ data: { companyId, code: "OTHER", name: "Fictional other agency" } })
      const usersByRole = new Map()
      for (const role of roles) {
        const user = await prisma.user.create({ data: { companyId, email: `${kind}-${role.toLowerCase()}-${surface}@example.test`, name: `Fictional ${kind} reader`, emailVerified: new Date(), passwordHash } })
        const membership = await prisma.membership.create({ data: { companyId, userId: user.id, role, status: "ACTIVE" } })
        usersByRole.set(role, user.id)
        await prisma.agencyMembership.create({ data: { agencyId: localAgency.id, membershipId: membership.id } })
      }
      await prisma.saasSubscription.create({ data: { companyId, plan: "RESEAU", status: "ACTIVE", seatQuantity: 30 } })
      if (kind === "contact-readers") {
        const client = await prisma.client.create({ data: { companyId, name: "Fictional contact reader client" } })
        const contact = await prisma.contact.create({ data: { id: `ccontactreaders${surface}local`, clientId: client.id, firstName: "Fictional", lastName: "Local", email: "contact@example.test", marketingStatus: "OPTED_IN" } })
        let sharedChannelId
        for (const [visibility, ownerRole, label] of [["SHARED", null, "shared"], ["PRIVATE", "SALES", "personal"], ["PRIVATE", "OWNER", "colleague"]]) {
          const channel = await prisma.communicationChannel.create({ data: { companyId, visibility, ownerUserId: ownerRole ? usersByRole.get(ownerRole) : null, provider: "GOOGLE", emailAddress: `${label}@example.test` } })
          await prisma.emailThread.create({ data: { companyId, channelId: channel.id, contactId: contact.id, subject: `Fictional ${label} contact thread`, messages: { create: { companyId, direction: "INBOUND", provider: "GOOGLE", fromAddress: contact.email, toAddresses: [channel.emailAddress], subject: `Fictional ${label} contact message` } } } })
          if (label === "shared") sharedChannelId = channel.id
        }
        const lead = await prisma.leadCapture.create({ data: { companyId, clientId: client.id, contactId: contact.id, firstName: "Fictional", lastName: "Local", privacyAccepted: true, fingerprint: `fictional-contact-${surface}`, source: "FICTIONAL-LOCAL" } })
        const sequence = await prisma.emailSequence.create({ data: { companyId, name: "Fictional local contact sequence" } })
        const enrollment = await prisma.emailSequenceEnrollment.create({ data: { sequenceId: sequence.id, leadCaptureId: lead.id, contactId: contact.id } })
        await prisma.emailDelivery.create({ data: { companyId, channelId: sharedChannelId, contactId: contact.id, enrollmentId: enrollment.id, recipientEmail: contact.email, subject: "Fictional local contact delivery", status: "SENT", sentAt: new Date(), scheduledAt: new Date() } })
        await prisma.marketingConsent.create({ data: { companyId, contactId: contact.id, channel: "EMAIL", purpose: "MARKETING", status: "GRANTED", legalBasis: "CONSENT", source: "FICTIONAL-LOCAL", proofHash: "fictional-local-contact-proof" } })
        await prisma.clientPortalAccess.create({ data: { companyId, clientId: client.id, contactId: contact.id, label: "Fictional local portal", tokenHash: `fictional-contact-portal-${surface}`, expiresAt: new Date("2030-01-01") } })
        const foreign = await prisma.company.create({ data: { name: `Fictional foreign contact reader company ${surface}` } })
        const foreignLead = await prisma.leadCapture.create({ data: { companyId: foreign.id, contactId: contact.id, firstName: "Fictional", lastName: "Foreign", privacyAccepted: true, fingerprint: `fictional-foreign-contact-${surface}`, source: "FICTIONAL-FOREIGN" } })
        const foreignSequence = await prisma.emailSequence.create({ data: { companyId: foreign.id, name: "Fictional foreign contact sequence" } })
        await prisma.emailSequenceEnrollment.create({ data: { sequenceId: foreignSequence.id, leadCaptureId: foreignLead.id, contactId: contact.id } })
        await prisma.emailThread.create({ data: { companyId: foreign.id, channelId: sharedChannelId, contactId: contact.id, subject: "Fictional foreign contact thread" } })
        await prisma.emailDelivery.create({ data: { companyId: foreign.id, channelId: sharedChannelId, contactId: contact.id, enrollmentId: enrollment.id, recipientEmail: contact.email, subject: "Fictional foreign contact delivery", status: "SENT", scheduledAt: new Date() } })
        await prisma.marketingConsent.create({ data: { companyId: foreign.id, contactId: contact.id, channel: "EMAIL", purpose: "MARKETING", status: "GRANTED", legalBasis: "CONSENT", source: "FICTIONAL-FOREIGN", proofHash: "fictional-foreign-contact-proof", capturedAt: new Date("2035-01-01") } })
        continue
      }
      if (kind === "project-readers") {
        const client = await prisma.client.create({ data: { companyId, name: "Fictional project reader client", relationScore: 37, totalRevenueCents: 45678, totalUnpaidCents: 9876, renewalAmountCents: 12345 } })
        const project = await prisma.project.create({ data: { id: `cprojectreaders${surface}local`, companyId, clientId: client.id, agencyId: localAgency.id, name: "Fictional scoped reader project", budgetCents: 50000, consumedCents: 5000 } })
        await prisma.quote.create({ data: { companyId, clientId: client.id, projectId: project.id, number: "READER-QUOTE", object: "Fictional reader quote" } })
        await prisma.invoice.create({ data: { companyId, clientId: client.id, projectId: project.id, number: "READER-INVOICE", object: "Fictional reader invoice", dueDate: new Date("2030-01-01"), totalHtCents: 10000, totalTvaCents: 0, totalTtcCents: 10000 } })
        await prisma.timeEntry.create({ data: { projectId: project.id, durationSec: 3600, description: "Fictional reader time" } })
        const foreign = await prisma.company.create({ data: { name: `Fictional foreign project reader company ${surface}` } })
        const foreignClient = await prisma.client.create({ data: { companyId: foreign.id, name: "Fictional foreign project reader client" } })
        await prisma.project.create({ data: { id: `cprojectreaders${surface}inconsistent`, companyId, clientId: foreignClient.id, agencyId: localAgency.id, name: "Fictional inconsistent reader project" } })
        await prisma.quote.create({ data: { companyId, clientId: foreignClient.id, projectId: project.id, number: "READER-INCONSISTENT-QUOTE", object: "Fictional inconsistent reader quote" } })
        await prisma.invoice.create({ data: { companyId, clientId: foreignClient.id, projectId: project.id, number: "READER-INCONSISTENT-INVOICE", object: "Fictional inconsistent reader invoice", dueDate: new Date("2030-01-01"), totalHtCents: 20000, totalTvaCents: 0, totalTtcCents: 20000 } })
        continue
      }
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
