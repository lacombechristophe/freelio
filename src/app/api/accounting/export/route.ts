import { createHash } from "node:crypto"
import { strToU8, zipSync } from "fflate"

import { buildPreAccountingJournal, journalBalance, PRE_ACCOUNTING_COLUMNS, rowsToCsv } from "@/lib/accounting/export"
import prisma from "@/lib/prisma"
import { withRouteAuth } from "@/lib/route-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function parseDate(value: string | null, fallback: Date) {
  if (!value) return fallback
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(date.getTime()) ? fallback : date
}

function iso(value: Date | null | undefined) {
  return value?.toISOString() ?? ""
}

function filenameSlug(value: string) {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "entreprise"
  )
}

export async function GET(request: Request) {
  return withRouteAuth("finance.read", async (context) => {
    const now = new Date()
    const url = new URL(request.url)
    const from = parseDate(url.searchParams.get("from"), new Date(Date.UTC(now.getUTCFullYear(), 0, 1)))
    const to = parseDate(url.searchParams.get("to"), new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1)))
    if (to <= from) return Response.json({ error: "La date de fin doit être postérieure à la date de début" }, { status: 400 })

    const [company, invoices, expenses] = await Promise.all([
      prisma.company.findUnique({ where: { id: context.companyId }, select: { name: true, siret: true } }),
      prisma.invoice.findMany({
        where: { companyId: context.companyId, status: { in: ["SENT", "OVERDUE", "PAID"] }, date: { gte: from, lt: to } },
        include: {
          client: { select: { id: true, name: true, siret: true } },
          project: { select: { name: true } },
          lines: { orderBy: { order: "asc" } },
          payments: { orderBy: { date: "asc" } },
        },
        orderBy: [{ date: "asc" }, { number: "asc" }],
      }),
      prisma.expense.findMany({
        where: { companyId: context.companyId, date: { gte: from, lt: to } },
        include: { client: { select: { name: true } }, project: { select: { name: true } }, files: { select: { name: true, sha256: true } } },
        orderBy: [{ date: "asc" }, { id: "asc" }],
      }),
    ])
    if (!company) return Response.json({ error: "Entreprise introuvable" }, { status: 404 })

    const salesRows = invoices.map((invoice) => ({
      Type: invoice.type,
      Numero: invoice.number,
      Date: iso(invoice.date).slice(0, 10),
      Echeance: iso(invoice.dueDate).slice(0, 10),
      Client: invoice.client.name,
      SIRETClient: invoice.client.siret ?? "",
      Objet: invoice.object,
      Projet: invoice.project?.name ?? "",
      TotalHT: (invoice.totalHtCents / 100).toFixed(2),
      TVA: (invoice.totalTvaCents / 100).toFixed(2),
      TotalTTC: (invoice.totalTtcCents / 100).toFixed(2),
      Encaisse: (invoice.paidAmountCents / 100).toFixed(2),
      Statut: invoice.status,
      EFacture: invoice.eInvoiceStatus,
    }))
    const lineRows = invoices.flatMap((invoice) =>
      invoice.lines.map((line) => ({
        Numero: invoice.number,
        Libelle: line.label,
        Description: line.description ?? "",
        Quantite: line.quantity,
        PrixUnitaireHT: (line.unitPriceCents / 100).toFixed(2),
        TauxTVA: line.tvaRate,
      })),
    )
    const paymentRows = invoices.flatMap((invoice) =>
      invoice.payments.map((payment) => ({
        NumeroFacture: invoice.number,
        Client: invoice.client.name,
        Date: iso(payment.date).slice(0, 10),
        Montant: (payment.amountCents / 100).toFixed(2),
        Mode: payment.method,
        Reference: payment.reference ?? "",
      })),
    )
    const purchaseRows = expenses.map((expense) => ({
      Date: iso(expense.date).slice(0, 10),
      Fournisseur: expense.provider ?? "",
      Libelle: expense.label,
      Categorie: expense.category,
      MontantTTC: (expense.amountCents / 100).toFixed(2),
      TVA: (expense.tvaCents / 100).toFixed(2),
      Client: expense.client?.name ?? "",
      Projet: expense.project?.name ?? "",
      Statut: expense.status,
      Justificatifs: expense.files.map((file) => `${file.name}${file.sha256 ? `#${file.sha256}` : ""}`).join(" | "),
    }))
    const journal = buildPreAccountingJournal({ invoices, expenses })
    const balance = journalBalance(journal)
    if (!balance.balanced) return Response.json({ error: "L’export précomptable n’est pas équilibré" }, { status: 500 })

    const csvFiles = {
      "ventes.csv": rowsToCsv(Object.keys(salesRows[0] ?? { Numero: "" }), salesRows),
      "lignes-ventes.csv": rowsToCsv(Object.keys(lineRows[0] ?? { Numero: "" }), lineRows),
      "reglements.csv": rowsToCsv(Object.keys(paymentRows[0] ?? { NumeroFacture: "" }), paymentRows),
      "achats.csv": rowsToCsv(Object.keys(purchaseRows[0] ?? { Date: "" }), purchaseRows),
      "journal-precomptable.csv": rowsToCsv(PRE_ACCOUNTING_COLUMNS, journal),
    }
    const fileManifest = Object.fromEntries(
      Object.entries(csvFiles).map(([name, content]) => [name, { bytes: Buffer.byteLength(content, "utf8"), sha256: createHash("sha256").update(content).digest("hex") }]),
    )
    const manifest = {
      schema: "crm.preaccounting-export.v1",
      generatedAt: now.toISOString(),
      company: { name: company.name, siret: company.siret },
      period: { from: from.toISOString(), toExclusive: to.toISOString() },
      counts: { invoices: invoices.length, invoiceLines: lineRows.length, payments: paymentRows.length, expenses: expenses.length, journalLines: journal.length },
      balance,
      files: fileManifest,
      warning: "Export précomptable de travail. Il ne constitue pas un FEC réglementaire et doit être validé/importé par le cabinet comptable.",
    }
    const zip = zipSync(
      {
        ...Object.fromEntries(Object.entries(csvFiles).map(([name, content]) => [name, strToU8(`\uFEFF${content}`)])),
        "manifest.json": strToU8(JSON.stringify(manifest, null, 2)),
      },
      { level: 6 },
    )
    const stamp = `${from.toISOString().slice(0, 10)}_${new Date(to.getTime() - 1).toISOString().slice(0, 10)}`
    return new Response(Buffer.from(zip), {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${filenameSlug(company.name)}-export-comptable-${stamp}.zip"`,
        "content-length": String(zip.byteLength),
        "cache-control": "private, no-store",
      },
    })
  })
}
