const databaseUrl = process.env.DATABASE_URL || ""
const { PrismaClient } = databaseUrl.startsWith("postgres")
  ? await import("@crm/prisma-postgres")
  : await import("@prisma/client")

const prisma = new PrismaClient()
const email = process.env.E2E_USER_EMAIL || "qa-crm@example.com"

async function main() {
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
  const user = await prisma.user.upsert({
    where: { email },
    update: { companyId: company.id, emailVerified: new Date() },
    create: { email, name: "Utilisateur QA", emailVerified: new Date(), companyId: company.id },
  })
  const membership = await prisma.membership.create({ data: { companyId: company.id, userId: user.id, role: "OWNER", status: "ACTIVE" } })
  const client = await prisma.client.create({ data: { companyId: company.id, name: "Client QA Piscine", type: "INDIVIDUAL", address: "2 rue du Bassin, 44000 Nantes" } })
  await prisma.contact.create({ data: { clientId: client.id, firstName: "Camille", lastName: "Piscine", email: "camille@example.com", isPrimary: true } })
  const site = await prisma.customerSite.create({ data: { companyId: company.id, clientId: client.id, label: "Bassin QA", kind: "INSTALLATION", address1: "2 rue du Bassin", postalCode: "44000", city: "Nantes", latitude: 47.2184, longitude: -1.5536 } })
  const project = await prisma.project.create({ data: { companyId: company.id, clientId: client.id, siteId: site.id, name: "Chantier QA existant", status: "ACTIVE", worksiteType: "INSTALLATION" } })
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
  const warehouse = await prisma.warehouse.create({ data: { companyId: company.id, name: "Dépôt QA", code: "QA" } })
  const product = await prisma.product.create({ data: { companyId: company.id, sku: "QA-COVER", label: "Couverture de test", salePriceCents: 10_000, purchasePriceCents: 5_000 } })
  await prisma.inventoryItem.create({ data: { companyId: company.id, warehouseId: warehouse.id, productId: product.id, quantity: 5, reservedQuantity: 0 } })
  const equipment = await prisma.equipment.create({ data: { companyId: company.id, siteId: site.id, productId: product.id, label: "Couverture QA installée", category: "COVER", status: "ACTIVE" } })
  const intervention = await prisma.fieldIntervention.create({ data: { companyId: company.id, projectId: project.id, siteId: site.id, assignedMembershipId: membership.id, title: "Intervention QA terrain", type: "INSTALLATION", status: "IN_PROGRESS", scheduledStart: new Date(), startedAt: new Date() } })
  console.log(JSON.stringify({ companyId: company.id, userId: user.id, email, clientId: client.id, projectId: project.id, siteId: site.id, warehouseId: warehouse.id, productId: product.id, equipmentId: equipment.id, interventionId: intervention.id }))
}

main().finally(() => prisma.$disconnect())
