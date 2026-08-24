import { getClientsMinimal } from "@/actions/clients"
import { getBillingSettings } from "@/actions/settings"
import { getQuoteProductCatalog } from "@/actions/products"
import { QuoteForm } from "../quote-form"
import { PageHeader } from "@/components/shared/page-header"

export default async function NewDevisPage() {
  const [clients, billingSettings, productCatalog] = await Promise.all([
    getClientsMinimal(),
    getBillingSettings(),
    getQuoteProductCatalog(),
  ])
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Nouveau document" title="Nouveau devis" description="Choisissez un client, détaillez la prestation et vérifiez les montants avant enregistrement." />
      <QuoteForm clients={clients ?? []} productCatalog={productCatalog} isTvaApplicable={billingSettings?.isTvaApplicable ?? true} />
    </div>
  )
}
