import { notFound } from "next/navigation"
import { getInvoiceById } from "@/actions/factures"
import { getBillingSettings } from "@/actions/settings"
import { InvoiceForm } from "../../invoice-form"
import { PageHeader } from "@/components/shared/page-header"

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [invoice, billingSettings] = await Promise.all([
    getInvoiceById(id),
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
        initialClient={{ id: invoice.client.id, name: invoice.client.name }}
        isTvaApplicable={billingSettings?.isTvaApplicable ?? true}
      />
    </div>
  )
}
