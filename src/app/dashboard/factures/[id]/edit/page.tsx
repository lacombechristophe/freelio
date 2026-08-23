import { notFound } from "next/navigation"
import { getInvoiceById } from "@/actions/factures"
import { getClientsMinimal } from "@/actions/clients"
import { getBillingSettings } from "@/actions/settings"
import { InvoiceForm } from "../../invoice-form"
import { PageHeader } from "@/components/shared/page-header"

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [invoice, clients, billingSettings] = await Promise.all([
    getInvoiceById(id),
    getClientsMinimal(),
    getBillingSettings(),
  ])
  if (!invoice) notFound()
  if (invoice.status !== "DRAFT") {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        Cette facture n'est plus modifiable (statut : {invoice.status}).
      </div>
    )
  }

  const initialLines = invoice.lines.map((l) => ({
    label: l.label,
    description: l.description ?? undefined,
    quantity: l.quantity,
    unitPriceCents: l.unitPriceCents,
    tvaRate: l.tvaRate,
  }))

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Brouillon" title={`Modifier ${invoice.number}`} description="Ajustez la facture tant qu’elle n’a pas encore été émise." />
      <InvoiceForm
        invoice={{
          id: invoice.id,
          clientId: invoice.clientId,
          projectId: invoice.projectId,
          object: invoice.object,
          type: invoice.type,
          dueDate: invoice.dueDate,
        }}
        initialLines={initialLines}
        clients={clients ?? []}
        isTvaApplicable={billingSettings?.isTvaApplicable ?? true}
      />
    </div>
  )
}
