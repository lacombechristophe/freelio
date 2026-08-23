import { notFound } from "next/navigation"
import { getQuoteById } from "@/actions/devis"
import { getClientsMinimal } from "@/actions/clients"
import { getBillingSettings } from "@/actions/settings"
import { QuoteForm } from "../../quote-form"
import { PageHeader } from "@/components/shared/page-header"

export default async function EditQuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [quote, clients, billingSettings] = await Promise.all([
    getQuoteById(id),
    getClientsMinimal(),
    getBillingSettings(),
  ])
  if (!quote) notFound()
  if (quote.status !== "DRAFT") {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        Ce devis n'est plus modifiable (statut : {quote.status}).
      </div>
    )
  }

  const latest = quote.versions[0]
  const initialLines = (latest?.sections.flatMap((s) => s.lines) ?? []).map((l) => ({
    label: l.label,
    description: l.description ?? undefined,
    quantity: l.quantity,
    unitPriceCents: l.unitPriceCents,
    tvaRate: l.tvaRate,
  }))

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Brouillon" title={`Modifier ${quote.number}`} description="Mettez à jour le contenu du devis avant son émission." />
      <QuoteForm
        quote={{
          id: quote.id,
          clientId: quote.clientId,
          projectId: quote.projectId,
          object: quote.object,
          validUntil: quote.validUntil,
        }}
        initialLines={initialLines}
        clients={clients ?? []}
        isTvaApplicable={billingSettings?.isTvaApplicable ?? true}
      />
    </div>
  )
}
