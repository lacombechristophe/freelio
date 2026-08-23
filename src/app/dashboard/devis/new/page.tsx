import { getClientsMinimal } from "@/actions/clients"
import { getBillingSettings } from "@/actions/settings"
import { QuoteForm } from "../quote-form"
import { PageHeader } from "@/components/shared/page-header"

export default async function NewDevisPage() {
  const [clients, billingSettings] = await Promise.all([
    getClientsMinimal(),
    getBillingSettings(),
  ])
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Nouveau document" title="Nouveau devis" description="Choisissez un client, détaillez la prestation et vérifiez les montants avant enregistrement." />
      <QuoteForm clients={clients ?? []} isTvaApplicable={billingSettings?.isTvaApplicable ?? true} />
    </div>
  )
}
