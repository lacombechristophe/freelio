import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Pencil, FileDown } from "lucide-react"
import { getInvoiceById } from "@/actions/factures"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DocumentStudio } from "@/components/shared/document-studio"
import type { PdfDocument } from "@/lib/pdf/render"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { InvoiceActions } from "../invoice-actions"

function formatEuro(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100)
}

function formatDate(d: Date | string) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })
}

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const invoice = await getInvoiceById(id)
  if (!invoice) notFound()

  const unpaid = invoice.totalTtcCents - invoice.paidAmountCents
  const pdfDocument: PdfDocument = {
    kind: "FACTURE",
    number: invoice.number,
    object: invoice.object,
    date: invoice.date.toISOString(),
    dueDate: invoice.dueDate.toISOString(),
    totalHtCents: invoice.totalHtCents,
    totalTvaCents: invoice.totalTvaCents,
    totalTtcCents: invoice.totalTtcCents,
    lines: invoice.lines.map((line) => ({
      label: line.label,
      description: line.description,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      tvaRate: line.tvaRate,
    })),
    client: {
      name: invoice.client.name,
      address: invoice.client.address,
      siret: invoice.client.siret,
      tvaNumber: invoice.client.tvaNumber,
    },
    company: {
      name: invoice.company.name,
      fullName: invoice.company.fullName,
      address: invoice.company.address,
      email: invoice.company.email,
      phone: invoice.company.phone,
      logo: invoice.company.logo,
      siret: invoice.company.siret,
      tvaNumber: invoice.company.tvaNumber,
      apeCode: invoice.company.apeCode,
      rcsNumber: invoice.company.rcsNumber,
      iban: invoice.company.iban,
      isTvaApplicable: invoice.company.isTvaApplicable,
      latePenaltyRate: invoice.company.latePenaltyRate,
      brandColor: invoice.company.brandColor,
      pdfTemplate: invoice.company.pdfTemplate,
    },
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Link href="/dashboard/factures">
            <Button variant="ghost" size="icon" aria-label="Retour aux factures"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <h1 className="break-all text-2xl font-bold tracking-tight font-mono">{invoice.number}</h1>
            <Badge variant="secondary">{invoice.status}</Badge>
            <Badge variant="outline">E-facture : {invoice.eInvoiceStatus}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {invoice.object} —{" "}
            <Link href={`/dashboard/clients/${invoice.clientId}`} className="hover:underline">
              {invoice.client.name}
            </Link>
          </p>
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
          <a href={`/api/pdf/facture/${invoice.id}`} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" className="gap-2">
              <FileDown className="h-4 w-4" /> PDF
            </Button>
          </a>
          <a href="#document-studio">
            <Button variant="outline" className="gap-2">
              <FileDown className="h-4 w-4" /> Studio
            </Button>
          </a>
          {invoice.status === "DRAFT" && (
            <Link href={`/dashboard/factures/${invoice.id}/edit`}>
              <Button variant="outline" className="gap-2">
                <Pencil className="h-4 w-4" /> Éditer
              </Button>
            </Link>
          )}
          <InvoiceActions
            invoiceId={invoice.id}
            invoiceNumber={invoice.number}
            status={invoice.status}
            type={invoice.type}
            unpaidCents={unpaid}
          />
        </div>
      </div>

      {invoice.eInvoiceError && (
        <div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          Préparation e-facturation incomplète : {invoice.eInvoiceError}
        </div>
      )}
      {invoice.originalInvoice && (
        <div className="text-sm text-muted-foreground">
          Avoir lié à <Link className="font-medium text-foreground hover:underline" href={`/dashboard/factures/${invoice.originalInvoice.id}`}>{invoice.originalInvoice.number}</Link>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-widest text-muted-foreground">Total HT</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{formatEuro(invoice.totalHtCents)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-widest text-muted-foreground">TVA</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{formatEuro(invoice.totalTvaCents)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-widest text-muted-foreground">Total TTC</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{formatEuro(invoice.totalTtcCents)}</p></CardContent>
        </Card>
        <Card className={unpaid > 0 ? "border-danger/40" : "border-success/40"}>
          <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-widest text-muted-foreground">Reste à payer</CardTitle></CardHeader>
          <CardContent><p className={`text-2xl font-bold ${unpaid > 0 ? "text-danger" : "text-success"}`}>{formatEuro(unpaid)}</p></CardContent>
        </Card>
      </div>

      <DocumentStudio
        kind="facture"
        documentId={invoice.id}
        documentNumber={invoice.number}
        defaultTemplate={invoice.company.pdfTemplate}
        document={pdfDocument}
      />

      <Card>
        <CardHeader><CardTitle className="text-sm">Lignes</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Libellé</TableHead>
                <TableHead>Qté</TableHead>
                <TableHead>PU HT</TableHead>
                <TableHead>TVA</TableHead>
                <TableHead className="text-right">Total HT</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.lines.map((l) => {
                const ht = Math.round(l.quantity * l.unitPriceCents)
                return (
                  <TableRow key={l.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{l.label}</span>
                        {l.description && <span className="text-xs text-muted-foreground">{l.description}</span>}
                      </div>
                    </TableCell>
                    <TableCell>{l.quantity}</TableCell>
                    <TableCell>{formatEuro(l.unitPriceCents)}</TableCell>
                    <TableCell>{l.tvaRate}%</TableCell>
                    <TableCell className="text-right font-bold">{formatEuro(ht)}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {invoice.payments.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Paiements ({invoice.payments.length})</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Méthode</TableHead>
                  <TableHead>Référence</TableHead>
                  <TableHead className="text-right">Montant</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoice.payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-xs">{formatDate(p.date)}</TableCell>
                    <TableCell>{p.method}</TableCell>
                    <TableCell>{p.reference ?? "—"}</TableCell>
                    <TableCell className="text-right font-bold">{formatEuro(p.amountCents)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {invoice.creditInvoices.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Avoirs émis</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {invoice.creditInvoices.map((credit) => (
              <Link key={credit.id} href={`/dashboard/factures/${credit.id}`} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-muted/40">
                <span className="font-mono font-medium">{credit.number}</span>
                <span>{formatEuro(credit.totalTtcCents)}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {invoice.reminders.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Historique des relances</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {invoice.reminders.map((reminder) => (
              <div key={reminder.id} className="flex justify-between rounded-md border px-3 py-2">
                <span>{reminder.subject}</span>
                <span className="text-muted-foreground">{reminder.status} · {formatDate(reminder.createdAt)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="text-xs text-muted-foreground flex gap-4">
        <span>Créée le {formatDate(invoice.createdAt)}</span>
        <span>Échéance : {formatDate(invoice.dueDate)}</span>
      </div>
    </div>
  )
}
