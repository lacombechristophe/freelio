import prisma from "../src/lib/prisma"
import { prepareIssuedInvoice } from "../src/lib/finance/issued-invoice"

const url = new URL(process.env.DATABASE_URL || "")
if (process.env.RECIPE_ISOLATED !== "true" || process.env.NODE_ENV === "production" || url.hostname !== "127.0.0.1" || url.pathname !== "/freelio_recipe") throw new Error("Fixture réservée à la recette PostgreSQL isolée")
async function main() {
try {
  const company = await prisma.company.upsert({ where: { id: "recovery-fixture-company" }, update: { tvaNumber: "FR00000000000" }, create: { id: "recovery-fixture-company", name: "Émetteur fictif — recette PRA", address: "Adresse fictive de recette", siret: "00000000000000", tvaNumber: "FR00000000000", isTvaApplicable: true } })
  const client = await prisma.client.create({ data: { companyId: company.id, name: "Client fictif — recette PRA", address: "Adresse fictive" } })
  const invoice = await prisma.invoice.upsert({ where: { companyId_number: { companyId: company.id, number: "RECETTE-PRA-001" } }, update: {}, create: { companyId: company.id, clientId: client.id, number: "RECETTE-PRA-001", object: "Archive fictive pour restauration", dueDate: new Date(Date.now() + 30 * 86400000), totalHtCents: 10000, totalTvaCents: 2000, totalTtcCents: 12000, lines: { create: { label: "Prestation fictive", quantity: 1, unitPriceCents: 10000, tvaRate: 20 } } }, include: { company: true, client: true, lines: true } })
  if (invoice.issuedDocument) throw new Error("L’archive de recette existe déjà ; elle reste inchangée")
  const archive = await prepareIssuedInvoice(invoice)
  await prisma.invoice.update({ where: { id: invoice.id }, data: { ...archive, status: "SENT", lockedAt: new Date() } })
  console.log(JSON.stringify({ fixture: "RECETTE-PRA-001", pdfArchived: true }))
} finally { await prisma.$disconnect() }
}
void main().catch(error => { console.error(error instanceof Error ? error.message : "Fixture failed"); process.exitCode = 1 })
