import path from "node:path"
import { PrismaClient } from "@prisma/client"
import { hashPassword } from "../src/lib/auth/password-core.ts"

// Explicit local database only; this script never loads .env files or resets data.
const databaseUrl = process.env.DATABASE_URL || ""
const databasePath = databaseUrl.startsWith("file:") ? path.resolve(databaseUrl.slice(5)) : ""
const postgresName = /^postgres(ql)?:\/\//.test(databaseUrl) ? new URL(databaseUrl).pathname.slice(1) : ""
const dedicatedPostgres = /^freelio_demo_[a-z0-9_]+$/.test(postgresName) && process.env.DEMO_DATABASE_NAME === postgresName
if (process.env.NODE_ENV === "production" || (!dedicatedPostgres && (!databasePath || !/demo[^/\\]*\.db$/i.test(databasePath)))) throw new Error("Une base dédiée demo*.db ou freelio_demo_* confirmée par DEMO_DATABASE_NAME est obligatoire")
if (!process.env.DEMO_PASSWORD || process.env.DEMO_PASSWORD.length < 12) throw new Error("DEMO_PASSWORD doit contenir au moins 12 caractères")
const prisma = new PrismaClient()
const email = "direction@atelier-des-bassins.example.test"
try {
  if (await prisma.user.findUnique({ where: { email } })) throw new Error("Le compte de démonstration existe déjà ; aucune donnée modifiée")
  const passwordHash = await hashPassword(process.env.DEMO_PASSWORD)
  const today = new Date()
  const day = offset => new Date(today.getTime() + offset * 86_400_000)
  const result = await prisma.$transaction(async tx => {
    // Deliberately fictitious VAT identifier; taxable example invoices need a seller identifier.
    const company = await tx.company.create({ data: { name: "Atelier des Bassins — démonstration", fullName: "Atelier des Bassins (données fictives)", address: "12 allée des Nénuphars, 44000 Nantes — adresse fictive", email, isTvaApplicable: true, tvaNumber: "FR00000000000" } })
    const user = await tx.user.create({ data: { email, name: "Alex Martin (démo)", emailVerified: today, companyId: company.id, passwordHash } })
    const membership = await tx.membership.create({ data: { companyId: company.id, userId: user.id, role: "OWNER", status: "ACTIVE" } })
    const agency = await tx.agency.create({ data: { companyId: company.id, code: "DEMO", name: "Agence Nantes — démo", kind: "MIXED", isDefault: true } })
    await tx.agencyMembership.create({ data: { agencyId: agency.id, membershipId: membership.id, isPrimary: true } })
    await tx.saasSubscription.create({ data: { companyId: company.id, plan: "RESEAU", status: "ACTIVE", seatQuantity: 5 } })
    const warehouse = await tx.warehouse.create({ data: { companyId: company.id, agencyId: agency.id, code: "DEMO", name: "Dépôt de démonstration" } })
    const products = await Promise.all([
      { sku: "DEMO-POMPE", label: "Pompe de filtration à vitesse variable", salePriceCents: 84900, purchasePriceCents: 51000 },
      { sku: "DEMO-ENTRETIEN", label: "Forfait entretien saisonnier", salePriceCents: 32000, purchasePriceCents: 12000 },
      { sku: "DEMO-VOLET", label: "Volet de sécurité et pose", salePriceCents: 425000, purchasePriceCents: 270000 },
    ].map(data => tx.product.create({ data: { companyId: company.id, ...data } })))
    for (const product of products) await tx.inventoryItem.create({ data: { companyId: company.id, warehouseId: warehouse.id, productId: product.id, quantity: product.sku === "DEMO-VOLET" ? 2 : 8 } })
    const names = ["Famille Delmas (fictif)", "Résidence Les Amandiers (fictif)", "Gîte du Verger (fictif)", "Famille Roux (fictif)", "Camping Les Roseaux (fictif)", "Famille Lenoir (fictif)"]
    for (let index = 0; index < names.length; index++) {
      const client = await tx.client.create({ data: { companyId: company.id, name: names[index], type: index % 2 ? "ENTERPRISE" : "INDIVIDUAL", address: `${20 + index} rue des Jardins, 44000 Nantes — adresse fictive` } })
      await tx.contact.create({ data: { clientId: client.id, firstName: ["Camille", "Morgan", "Lou", "Noé", "Charlie", "Sasha"][index], lastName: "Exemple", email: `client-${index + 1}@example.test`, isPrimary: true } })
      const site = await tx.customerSite.create({ data: { companyId: company.id, clientId: client.id, agencyId: agency.id, label: "Bassin principal (fictif)", address1: "Adresse de démonstration", postalCode: "44000", city: "Nantes" } })
      const product = products[index % products.length]
      const project = await tx.project.create({ data: { companyId: company.id, clientId: client.id, agencyId: agency.id, siteId: site.id, name: `${product.label} — dossier fictif`, status: "ACTIVE", startDate: day(index - 2) } })
      const ht = product.salePriceCents
      const vat = Math.round(ht * 0.2)
      await tx.quote.create({ data: { companyId: company.id, clientId: client.id, projectId: project.id, number: `DEMO-DEV-${today.getFullYear()}-${index + 1}`, object: product.label, status: index % 2 ? "SENT" : "DRAFT", date: day(-index), validUntil: day(30), versions: { create: { version: 1, totalHtCents: ht, totalTvaCents: vat, totalTtcCents: ht + vat, sections: { create: { title: "Prestation fictive", lines: { create: { label: product.label, quantity: 1, unitPriceCents: ht, tvaRate: 20 } } } } } } } })
      // Invoices stay draft until the normal issuance flow creates their immutable archive.
      await tx.invoice.create({ data: { companyId: company.id, clientId: client.id, projectId: project.id, number: `DEMO-FACT-${today.getFullYear()}-${index + 1}`, object: product.label, status: "DRAFT", date: today, dueDate: day(30), totalHtCents: ht, totalTvaCents: vat, totalTtcCents: ht + vat, lines: { create: { label: product.label, quantity: 1, unitPriceCents: ht, tvaRate: 20 } } } })
      const ticket = await tx.serviceTicket.create({ data: { companyId: company.id, clientId: client.id, siteId: site.id, number: `DEMO-SAV-${index + 1}`, title: index % 2 ? "Contrôle de filtration" : "Préparation de la mise en service", description: "Dossier de démonstration : données fictives, aucune demande réelle", status: "PLANNED", priority: index === 4 ? "HIGH" : "NORMAL", assignedMembershipId: membership.id, dueAt: day(index + 1) } })
      await tx.fieldIntervention.create({ data: { companyId: company.id, ticketId: ticket.id, projectId: project.id, siteId: site.id, assignedMembershipId: membership.id, title: ticket.title, type: "MAINTENANCE", status: "PLANNED", scheduledStart: day(index + 1), scheduledEnd: new Date(day(index + 1).getTime() + 90 * 60_000) } })
    }
    return { companyId: company.id, email, clients: names.length, quotes: names.length, draftInvoices: names.length, interventions: names.length }
  }, { timeout: 30_000 })
  console.log(JSON.stringify(result))
} finally { await prisma.$disconnect() }
