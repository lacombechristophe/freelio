import { getClientsMinimal } from "@/actions/clients"
import { getBillingSettings } from "@/actions/settings"
import { getQuoteProductCatalog } from "@/actions/products"
import { QuoteForm } from "../quote-form"
import { PageHeader } from "@/components/shared/page-header"

export default async function NewDevisPage({ searchParams }: PageProps<"/dashboard/devis/new">) {
  const [clients, billingSettings, productCatalog] = await Promise.all([
    getClientsMinimal(),
    getBillingSettings(),
    getQuoteProductCatalog(),
  ])
  const query = await searchParams
  const initialClientId = clients?.some((client) => client.id === query.clientId) ? String(query.clientId) : undefined
  return (
    <div className="workspace-page">
      <PageHeader className="workspace-page-header" eyebrow="Nouveau document" title="Nouveau devis" description="Choisissez un client, détaillez la prestation et vérifiez les montants avant enregistrement." />
      <QuoteForm initialClientId={initialClientId} clients={clients ?? []} productCatalog={productCatalog} isTvaApplicable={billingSettings?.isTvaApplicable ?? true} />
    </div>
  )
}
