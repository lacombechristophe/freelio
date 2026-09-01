import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Pencil, FileDown } from "lucide-react"
import { getQuoteById } from "@/actions/devis"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DocumentStudio } from "@/components/shared/document-studio"
import type { PdfDocument } from "@/lib/pdf/render"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { QuoteStatusActions } from "../quote-status-actions"
import { QuoteFulfillmentCard } from "../quote-fulfillment-card"
import { decryptSensitive } from "@/lib/crypto"

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Brouillon",
  SENT: "Envoyé",
  ACCEPTED: "Accepté",
  REJECTED: "Refusé",
  EXPIRED: "Expiré",
}

function formatEuro(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100)
}

function formatDate(d: Date | string) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })
}

export default async function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const quote = await getQuoteById(id)
  if (!quote) notFound()

  const latest = quote.versions[0]
  const allLines = latest?.sections.flatMap((s) => s.lines) ?? []
  const pdfDocument: PdfDocument | null = latest
    ? {
        kind: "DEVIS",
        number: quote.number,
        object: quote.object,
        date: quote.date.toISOString(),
        validUntil: quote.validUntil?.toISOString() ?? null,
        totalHtCents: latest.totalHtCents,
        totalTvaCents: latest.totalTvaCents,
        totalTtcCents: latest.totalTtcCents,
        lines: allLines.map((line) => ({
          label: line.label,
          description: line.description,
          quantity: line.quantity,
          unitPriceCents: line.unitPriceCents,
          tvaRate: line.tvaRate,
        })),
        client: {
          name: quote.client.name,
          address: quote.client.address,
          siret: quote.client.siret,
          tvaNumber: quote.client.tvaNumber,
        },
        company: {
          name: quote.company.name,
          fullName: quote.company.fullName,
          address: quote.company.address,
          email: quote.company.email,
          phone: quote.company.phone,
          logo: quote.company.logo,
          siret: quote.company.siret,
          tvaNumber: quote.company.tvaNumber,
          apeCode: quote.company.apeCode,
          rcsNumber: quote.company.rcsNumber,
          iban: decryptSensitive(quote.company.iban),
          isTvaApplicable: quote.company.isTvaApplicable,
          latePenaltyRate: quote.company.latePenaltyRate,
          brandColor: quote.company.brandColor,
          pdfTemplate: quote.company.pdfTemplate,
        },
      }
    : null

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Link href="/dashboard/devis">
            <Button variant="ghost" size="icon" aria-label="Retour aux devis"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <h1 className="break-all text-2xl font-bold tracking-tight font-mono">{quote.number}</h1>
            <Badge variant="secondary">{STATUS_LABELS[quote.status] ?? quote.status}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {quote.object} —{" "}
            <Link href={`/dashboard/clients/${quote.clientId}`} className="hover:underline">
              {quote.client.name}
            </Link>
          </p>
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
          <a href={`/api/pdf/devis/${quote.id}`} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" className="gap-2">
              <FileDown className="h-4 w-4" /> PDF
            </Button>
          </a>
          <a href="#document-studio">
            <Button variant="outline" className="gap-2">
              <FileDown className="h-4 w-4" /> Studio
            </Button>
          </a>
          {quote.status === "DRAFT" && (
            <Link href={`/dashboard/devis/${quote.id}/edit`}>
              <Button variant="outline" className="gap-2">
                <Pencil className="h-4 w-4" /> Éditer
              </Button>
            </Link>
          )}
          <QuoteStatusActions quoteId={quote.id} status={quote.status} hasOrder={Boolean(quote.customerOrder)} hasContract={Boolean(quote.generatedContract)} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-widest text-muted-foreground">Total HT</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{latest ? formatEuro(latest.totalHtCents) : "—"}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-widest text-muted-foreground">TVA</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{latest ? formatEuro(latest.totalTvaCents) : "—"}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-widest text-muted-foreground">Total TTC</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{latest ? formatEuro(latest.totalTtcCents) : "—"}</p></CardContent>
        </Card>
      </div>

      <QuoteFulfillmentCard
        accepted={quote.status === "ACCEPTED"}
        order={quote.customerOrder}
        project={quote.project}
        contract={quote.generatedContract}
      />

      {pdfDocument && (
        <DocumentStudio
          kind="devis"
          documentId={quote.id}
          documentNumber={quote.number}
          defaultTemplate={quote.company.pdfTemplate}
          document={pdfDocument}
        />
      )}

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
              {allLines.map((l) => {
                const ht = Math.round(l.quantity * l.unitPriceCents)
                return (
                  <TableRow key={l.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{l.label}</span>
                        {l.productId ? <span className="mt-1 text-xs font-medium text-primary">Configuration catalogue{l.discountRate ? ` · remise ${l.discountRate}%` : ""}</span> : null}
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

      <div className="text-xs text-muted-foreground flex gap-4">
        <span>Créé le {formatDate(quote.createdAt)}</span>
        {quote.sentAt ? <span>Envoyé le {formatDate(quote.sentAt)}</span> : null}
        {quote.acceptedAt ? <span>Accepté le {formatDate(quote.acceptedAt)}</span> : null}
        {quote.validUntil && <span>Valide jusqu'au {formatDate(quote.validUntil)}</span>}
      </div>
    </div>
  )
}
