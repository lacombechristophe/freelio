import { demoStoryId } from "../src/lib/demo-stories.ts"
import { DEFAULT_PIPELINE_STAGES } from "../src/lib/pipeline-rules.ts"
import { calculateLeadScore, leadMatchesSegment } from "../src/lib/marketing/intelligence-rules.ts"
import { consumedTimeBudgetCents } from "../src/lib/time-budget.ts"

// Additive and versioned: existing rows, including edited examples, are never reset.
export async function seedDemoStories(prisma, { companyId, referenceDate, apply = false }) {
  const reference = new Date(`${referenceDate}T12:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(referenceDate) || Number.isNaN(reference.getTime()) || reference.toISOString().slice(0, 10) !== referenceDate) throw new Error("Date de référence invalide")
  const id = key => demoStoryId(companyId, key)
  const day = offset => new Date(new Date(`${referenceDate}T12:00:00Z`).getTime() + offset * 86400000)
  return prisma.$transaction(async tx => {
    const company = await tx.company.findUniqueOrThrow({ where: { id: companyId } })
    if (company.name !== "Atelier des Bassins — démonstration" || company.email !== "direction@atelier-des-bassins.example.test") throw new Error("La société n’est pas la démonstration fictive attendue")
    const user = await tx.user.findFirstOrThrow({ where: { companyId, email: company.email } })
    const membership = await tx.membership.findFirstOrThrow({ where: { companyId, userId: user.id, status: "ACTIVE" } })
    const agency = await tx.agency.findFirstOrThrow({ where: { companyId, code: "DEMO" } })
    const scoringRule = { id: id("rule"), companyId, name: "Besoin local — règle de démonstration", field: "city", operator: "EQUALS", value: "Nantes", points: 15 }
    const scoringRules = await tx.leadScoringRule.findMany({ where: { companyId, status: "ACTIVE" } })
    if (!await tx.leadScoringRule.findUnique({ where: { id: scoringRule.id } })) scoringRules.push(scoringRule)
    const entries = []
    const add = (model, key, data) => { const row = { id: id(key), ...data }; entries.push({ model, data: row }); return row.id }
    const pipelineId = add("pipeline", "pipeline", { companyId, name: "Dossiers de démonstration", stages: DEFAULT_PIPELINE_STAGES })
    const definitions = [
      { key: "vente", client: "Famille Delmas (fictif)", title: "Volet de sécurité — visite et devis fictifs", ht: 425000, status: "QUALIFIED", product: "DEMO-VOLET" },
      { key: "chantier", client: "Résidence Les Amandiers (fictif)", title: "Filtration — chantier de démonstration", ht: 84900, status: "WON", product: "DEMO-POMPE" },
      { key: "sav", client: "Gîte du Verger (fictif)", title: "Entretien — suivi de démonstration", ht: 32000, status: "WON", product: "DEMO-ENTRETIEN" },
    ]
    const tour = []
    let exampleLead
    for (const story of definitions) {
      const client = await tx.client.findFirstOrThrow({ where: { companyId, name: story.client } })
      const contact = await tx.contact.findFirstOrThrow({ where: { clientId: client.id, email: { endsWith: "@example.test" } } })
      const site = await tx.customerSite.findFirstOrThrow({ where: { companyId, clientId: client.id, agencyId: agency.id } })
      const product = await tx.product.findFirstOrThrow({ where: { companyId, sku: story.product } })
      const projectId = add("project", `${story.key}-project`, { companyId, clientId: client.id, siteId: site.id, agencyId: agency.id, name: story.title, description: `Exemple fictif préparé au ${referenceDate}. Les dates sont fixes ; aucun rendez-vous ni envoi réel.`, status: "ACTIVE", budgetCents: story.ht, startDate: day(-7) })
      const opportunityId = add("opportunity", `${story.key}-opportunity`, { pipelineId, clientId: client.id, title: story.title, status: story.status, valueCents: story.ht, probability: story.status === "WON" ? 100 : 60, ownerMembershipId: membership.id, closeDate: day(7), closedAt: story.status === "WON" ? day(-7) : null })
      add("opportunityActivity", `${story.key}-activity`, { opportunityId, type: "NOTE", content: story.key === "vente" ? "Données fictives : dimensions à confirmer lors de la visite. Le devis reste à décider." : "Données fictives : accord de principe illustratif, aucune signature réelle.", createdAt: day(-6) })
      if (story.key === "vente") {
        const lead = { companyId, clientId: client.id, contactId: contact.id, opportunityId, firstName: contact.firstName, lastName: contact.lastName, email: contact.email, city: "Nantes", projectType: "Volet de sécurité", message: "Demande fictive de visite, aucun consentement de prospection réel.", source: "MANUAL", status: "QUALIFIED", privacyAccepted: true, marketingOptIn: false, fingerprint: id("lead-fingerprint"), createdAt: day(-6), score: 0 }
        const score = calculateLeadScore(lead, scoringRules)
        add("leadCapture", "lead", { ...lead, score: score.score, scoreBreakdown: score.breakdown, scoreUpdatedAt: day(0) })
        exampleLead = { ...lead, score: score.score }
      }
      const quoteId = add("quote", `${story.key}-quote`, { companyId, clientId: client.id, projectId, number: `DEMO-HISTOIRE-${story.key.toUpperCase()}`, object: story.title, status: story.key === "vente" ? "DRAFT" : "ACCEPTED", date: day(-7), validUntil: day(23), versions: { create: { version: 1, totalHtCents: story.ht, totalTvaCents: Math.round(story.ht * .2), totalTtcCents: Math.round(story.ht * 1.2), sections: { create: { title: "Prestation fictive", lines: { create: { label: product.label, quantity: 1, unitPriceCents: story.ht, tvaRate: 20 } } } } } } })
      add("organisationTask", `${story.key}-task`, { companyId, clientId: client.id, projectId, title: story.key === "vente" ? "Confirmer les dimensions et relire le devis fictif" : story.key === "chantier" ? "Vérifier le débit et préparer la réception fictive" : "Contrôler les paramètres après entretien fictif", category: story.key === "vente" ? "SALES" : "SUPPORT", status: "TODO", estimateMin: 45, dueDate: day(2) })
      if (story.key === "chantier") {
        add("projectMilestone", "chantier-survey", { projectId, title: "Relevé fictif effectué", status: "DONE", order: 0, dueDate: day(-5) })
        add("projectMilestone", "chantier-install", { projectId, title: "Pose et mise en service fictives", status: "IN_PROGRESS", order: 1, dueDate: day(2) })
        add("projectMilestone", "chantier-acceptance", { projectId, title: "Réception fictive à préparer", status: "PENDING", order: 2, dueDate: day(4) })
        add("timeEntry", "chantier-time", { projectId, date: day(-1), durationSec: 7200, description: "Pose et contrôle de filtration — exemple fictif", isBillable: true })
        add("invoice", "chantier-invoice", { companyId, clientId: client.id, projectId, number: "DEMO-HISTOIRE-FACTURE", object: "Filtration — brouillon fictif, jamais émis", status: "DRAFT", date: day(0), dueDate: day(30), totalHtCents: story.ht, totalTvaCents: Math.round(story.ht * .2), totalTtcCents: Math.round(story.ht * 1.2), lines: { create: { label: product.label, quantity: 1, unitPriceCents: story.ht, tvaRate: 20 } } })
        add("projectTechnicalProfile", "chantier-survey-profile", { projectId, surveyStatus: "SURVEYED", surveyedAt: day(-5), poolShape: "RECTANGLE", poolLengthMm: 8000, poolWidthMm: 4000, poolDepthMm: 1500, powerSupply: "230 V — exemple à vérifier", measurementNotes: "Mesures fictives, aucune installation réelle." })
      }
      let ticketId = null
      if (story.key === "sav") {
        const equipmentId = add("equipment", "sav-equipment", { companyId, siteId: site.id, productId: product.id, label: "Filtration du gîte — équipement fictif", serialNumber: "DEMO-HISTOIRE-SAV", installedAt: day(-180), notes: "Exemple fictif : baisse de débit, panier à contrôler." })
        ticketId = add("serviceTicket", "sav-ticket", { companyId, clientId: client.id, siteId: site.id, equipmentId, assignedMembershipId: membership.id, number: "DEMO-HISTOIRE-SAV", title: "Baisse de débit — diagnostic fictif", description: "Après nettoyage du panier, vérifier le débit et expliquer le contrôle au client fictif.", status: "PLANNED", dueAt: day(2) })
        add("fieldIntervention", "sav-intervention", { companyId, ticketId, projectId, siteId: site.id, assignedMembershipId: membership.id, title: "Contrôle de filtration — intervention fictive", scheduledStart: day(2), scheduledEnd: new Date(day(2).getTime() + 3600000), status: "PLANNED", type: "SAV" })
      }
      const threadId = add("emailThread", `${story.key}-thread`, { companyId, clientId: client.id, contactId: contact.id, serviceTicketId: ticketId, subject: story.title, lastMessageAt: day(-1), unreadCount: story.key === "vente" ? 1 : 0 })
      add("emailMessage", `${story.key}-message`, { companyId, threadId, direction: "INBOUND", provider: "DEMO", fromAddress: contact.email, toAddresses: [company.email], subject: story.title, bodyText: story.key === "vente" ? "Message fictif : pouvons-nous vérifier les dimensions avant de retenir le volet ?" : story.key === "chantier" ? "Message fictif : le local technique sera accessible pour la mise en service." : "Message fictif : le débit baisse après quelques jours. Quels contrôles préparer ?", status: "RECEIVED", receivedAt: day(-1), createdAt: day(-1) })
      tour.push({ key: story.key, projectId, opportunityId, quoteId, ticketId })
    }
    add("emailDraft", "draft", { companyId, authorUserId: user.id, createKey: id("draft-create"), requestKey: id("draft-request"), subject: "Préparer la visite — brouillon fictif", bodyHtml: "<p>Bonjour,</p><p>Voici les points à vérifier ensemble lors de la visite fictive : dimensions, accès et alimentation.</p><p>Aucun envoi réel n’est configuré.</p>", purpose: "SERVICE", cc: [], bcc: [] })
    const segmentId = add("marketingSegment", "segment", { companyId, name: "Nantes — exemple de segment dynamique", description: "Prospects fictifs de Nantes, sans inscription ni envoi automatique.", filters: { cityContains: "Nantes" }, status: "ACTIVE", lastBuiltAt: day(0) })
    const existingSegment = await tx.marketingSegment.findUnique({ where: { id: segmentId } })
    if ((!existingSegment || existingSegment.status === "ACTIVE") && leadMatchesSegment(exampleLead, existingSegment?.filters ?? { cityContains: "Nantes" }, day(0))) add("marketingSegmentMember", "segment-member", { segmentId, leadCaptureId: id("lead") })
    add("leadScoringRule", "rule", scoringRule)
    add("automationWorkflow", "workflow", { companyId, name: "Préparer une visite — scénario fictif inactif", trigger: "LEAD_CREATED", status: "DRAFT", actions: [{ type: "CREATE_TASK", title: "Vérifier les dimensions du projet fictif", delayHours: 24, priority: 2 }] })
    add("knowledgeArticle", "knowledge", { companyId, title: "Préparer une mise en service — exemple fictif", slug: "demo-mise-en-service-v1", summary: "Parcours de démonstration : vérifier les raccords et consigner les mesures.", bodyHtml: "<h2>Avant le rendez-vous fictif</h2><p>Vérifier l’accès au local, préparer le relevé et noter les points à confirmer.</p><h2>Après le contrôle</h2><p>Consigner le débit, les observations et la prochaine action. Ce document illustre l’outil et ne constitue pas une instruction technique.</p>", status: "PUBLISHED", visibility: "INTERNAL", publishedAt: day(-2) })
    add("notification", "notification", { companyId, userId: user.id, type: "SYSTEM", title: "Trois dossiers de démonstration à explorer", message: `Vente, chantier et SAV : exemples fictifs préparés au ${referenceDate}, sans envoi réel.` })
    const missing = []
    for (const entry of entries) {
      const existing = await tx[entry.model].findUnique({ where: { id: entry.data.id } })
      if (existing && entry.data.companyId && existing.companyId !== companyId) throw new Error("Identifiant de démonstration déjà utilisé hors société")
      if (existing && Object.entries(entry.data).some(([key, value]) => key.endsWith("Id") && existing[key] !== value)) throw new Error("Une relation d’un exemple existant a changé ; aucune donnée modifiée")
      if (!existing) missing.push(entry)
    }
    if (apply) for (const entry of missing) await tx[entry.model].create({ data: entry.data })
    if (apply && missing.some(entry => entry.model === "timeEntry")) {
      const duration = await tx.timeEntry.aggregate({ where: { projectId: id("chantier-project"), isBillable: true }, _sum: { durationSec: true } })
      await tx.project.update({ where: { id: id("chantier-project") }, data: { consumedCents: consumedTimeBudgetCents(duration._sum.durationSec ?? 0) } })
    }
    return { version: "stories-v1", apply, referenceDate, companyId, creates: missing.length, preserved: entries.length - missing.length, models: Object.fromEntries([...new Set(missing.map(entry => entry.model))].map(model => [model, missing.filter(entry => entry.model === model).length])), tour }
  }, { timeout: 30000 })
}
