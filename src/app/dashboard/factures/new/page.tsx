import { getClientsMinimal } from "@/actions/clients"
import { getBillingSettings } from "@/actions/settings"
import { InvoiceForm } from "../invoice-form"
import { PageHeader } from "@/components/shared/page-header"

export default async function NewInvoicePage() {
  const [clients, billingSettings] = await Promise.all([
    getClientsMinimal(),
    getBillingSettings(),
  ])
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Nouveau document" title="Nouvelle facture" description="Préparez les lignes, l’échéance et les informations de règlement avant émission." />
      <InvoiceForm clients={clients ?? []} isTvaApplicable={billingSettings?.isTvaApplicable ?? true} />
    </div>
  )
}
