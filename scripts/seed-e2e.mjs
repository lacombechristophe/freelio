import { createHash } from "node:crypto"
import { hashPassword } from "../src/lib/auth/password-core.ts"

const databaseUrl = process.env.DATABASE_URL || ""
const { PrismaClient } = databaseUrl.startsWith("postgres")
  ? await import("@crm/prisma-postgres")
  : await import("@prisma/client")

const prisma = new PrismaClient()
const email = process.env.E2E_USER_EMAIL || "qa-crm@example.com"
const password = process.env.E2E_USER_PASSWORD || "RecetteSolide2026"

async function main() {
  const passwordHash = await hashPassword(password)
  const company = await prisma.company.create({
    data: {
      id: "e2e-company",
      name: "Entreprise QA",
      fullName: "Entreprise QA",
      siret: "99999999900024",
      address: "1 rue des Tests, 44000 Nantes",
      email,
      isTvaApplicable: true,
      tvaNumber: "FR00999999999",
      brandColor: "#173B64",
    },
  })
  await prisma.saasSubscription.create({
    data: { companyId: company.id, plan: "RESEAU", status: "ACTIVE", seatQuantity: 30 },
  })
  const user = await prisma.user.upsert({
    where: { email },
    update: { companyId: company.id, name: "Utilisateur QA", emailVerified: new Date(), passwordHash },
    create: { email, name: "Utilisateur QA", emailVerified: new Date(), companyId: company.id, passwordHash },
  })
  const membership = await prisma.membership.create({ data: { companyId: company.id, userId: user.id, role: "OWNER", status: "ACTIVE" } })
  const agency = await prisma.agency.create({ data: { companyId: company.id, code: "PRINCIPALE", name: "Agence QA", kind: "MIXED", active: true, isDefault: true } })
  await prisma.agencyMembership.create({ data: { agencyId: agency.id, membershipId: membership.id, isPrimary: true } })
  const client = await prisma.client.create({ data: { companyId: company.id, name: "Client QA Piscine", type: "INDIVIDUAL", address: "2 rue du Bassin, 44000 Nantes" } })
  const contact = await prisma.contact.create({ data: { clientId: client.id, firstName: "Camille", lastName: "Piscine", email: "camille@example.com", isPrimary: true } })
  const lead = await prisma.leadCapture.create({ data: { companyId: company.id, clientId: client.id, contactId: contact.id, firstName: "Camille", lastName: "Piscine", email: "camille@example.com", city: "Nantes", projectType: "Couverture QA", source: "E2E_SEED", privacyAccepted: true, marketingOptIn: true, fingerprint: "e2e-seeded-lead" } })
  const marketingSegment = await prisma.marketingSegment.create({ data: { companyId: company.id, name: "Prospects consentis QA", description: "Audience de recette autorisée", kind: "STATIC", filters: { marketingOptIn: true } } })
  await prisma.marketingSegmentMember.create({ data: { segmentId: marketingSegment.id, leadCaptureId: lead.id } })
  const site = await prisma.customerSite.create({ data: { companyId: company.id, clientId: client.id, agencyId: agency.id, label: "Bassin QA", kind: "INSTALLATION", address1: "2 rue du Bassin", postalCode: "44000", city: "Nantes", latitude: 47.2184, longitude: -1.5536 } })
  const project = await prisma.project.create({ data: { companyId: company.id, clientId: client.id, agencyId: agency.id, siteId: site.id, name: "Chantier QA existant", status: "ACTIVE", worksiteType: "INSTALLATION" } })
  await prisma.quote.create({
    data: {
      companyId: company.id,
      clientId: client.id,
      number: "DEV-2026-900",
      object: "QA couverture de piscine",
      status: "SENT",
      versions: {
        create: {
          version: 1,
          totalHtCents: 10_000,
          totalTvaCents: 2_000,
          totalTtcCents: 12_000,
          sections: { create: { title: "Installation", lines: { create: { label: "Couverture QA", quantity: 1, unitPriceCents: 10_000, tvaRate: 20 } } } },
        },
      },
    },
  })
  const warehouse = await prisma.warehouse.create({ data: { companyId: company.id, agencyId: agency.id, name: "Dépôt QA", code: "QA" } })
  const product = await prisma.product.create({ data: { companyId: company.id, sku: "QA-COVER", label: "Couverture de test", salePriceCents: 10_000, purchasePriceCents: 5_000 } })
  await prisma.inventoryItem.create({ data: { companyId: company.id, warehouseId: warehouse.id, productId: product.id, quantity: 5, reservedQuantity: 0 } })
  const equipment = await prisma.equipment.create({ data: { companyId: company.id, siteId: site.id, productId: product.id, label: "Couverture QA installée", category: "COVER", status: "ACTIVE" } })
  const ticket = await prisma.serviceTicket.create({ data: { companyId: company.id, clientId: client.id, siteId: site.id, equipmentId: equipment.id, assignedMembershipId: membership.id, number: "SAV-2026-900", title: "Contrôle couverture QA", description: "Vérifier le réglage et le fonctionnement de la couverture de recette.", priority: "HIGH", status: "PLANNED", dueAt: new Date(Date.now() + 24 * 60 * 60 * 1_000) } })
  const serviceThread = await prisma.emailThread.create({ data: { companyId: company.id, clientId: client.id, contactId: contact.id, subject: "Question réglage couverture QA", status: "OPEN", unreadCount: 1, lastMessageAt: new Date() } })
  await prisma.emailMessage.create({ data: { companyId: company.id, threadId: serviceThread.id, direction: "INBOUND", provider: "RESEND", providerId: "e2e-service-email", fromAddress: "camille@example.com", toAddresses: [email], subject: "Question réglage couverture QA", bodyText: "Bonjour, pouvez-vous confirmer le contrôle prévu sur la couverture ?", status: "RECEIVED", receivedAt: new Date() } })
  const intervention = await prisma.fieldIntervention.create({ data: { companyId: company.id, ticketId: ticket.id, projectId: project.id, siteId: site.id, assignedMembershipId: membership.id, title: "Intervention QA terrain", type: "INSTALLATION", status: "IN_PROGRESS", scheduledStart: new Date(), startedAt: new Date() } })
  await prisma.knowledgeArticle.create({ data: { companyId: company.id, authorMembershipId: membership.id, title: "Entretenir la couverture QA", slug: "entretenir-couverture-qa", summary: "Une fiche pratique publiée pour le portail client.", bodyHtml: "<h2>Contrôle mensuel</h2><p>Nettoyez les rails et vérifiez le mouvement sans point dur.</p>", category: "Entretien", status: "PUBLISHED", visibility: "PORTAL", tags: ["couverture", "entretien"], publishedAt: new Date() } })
  const survey = await prisma.satisfactionSurvey.create({ data: { companyId: company.id, name: "CSAT QA après résolution", type: "CSAT", question: "Êtes-vous satisfait de la prise en charge ?", scaleMin: 1, scaleMax: 5, followUpQuestion: "Que pourrions-nous améliorer ?", triggerEvent: "TICKET_CLOSED", delayHours: 2 } })
  const feedbackToken = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
  await prisma.satisfactionRequest.create({ data: { companyId: company.id, surveyId: survey.id, clientId: client.id, contactId: contact.id, serviceTicketId: ticket.id, tokenHash: createHash("sha256").update(feedbackToken).digest("hex"), expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000) } })
  console.log(JSON.stringify({ companyId: company.id, userId: user.id, email, clientId: client.id, projectId: project.id, siteId: site.id, warehouseId: warehouse.id, productId: product.id, equipmentId: equipment.id, ticketId: ticket.id, interventionId: intervention.id }))
}

main().finally(() => prisma.$disconnect())
