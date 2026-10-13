import { getClientChoices } from "@/actions/clients/choices"
import { getBillingSettings } from "@/actions/settings"
import { getQuoteProductCatalog } from "@/actions/products"
import { QuoteForm } from "../quote-form"
import { PageHeader } from "@/components/shared/page-header"

export default async function NewDevisPage({ searchParams }: PageProps<"/dashboard/devis/new">) {
  const query = await searchParams
  const selectedId = typeof query.clientId === "string" && query.clientId.length <= 100 ? query.clientId || undefined : undefined
  const [clientChoices, billingSettings, productCatalog] = await Promise.all([
    getClientChoices({ selectedId }),
    getBillingSettings(),
    getQuoteProductCatalog(),
  ])
  return (
    <div className="workspace-page">
      <PageHeader className="workspace-page-header" eyebrow="Nouveau document" title="Nouveau devis" description="Choisissez un client, détaillez la prestation et vérifiez les montants avant enregistrement." />
      <QuoteForm initialClient={clientChoices?.selected ?? undefined} productCatalog={productCatalog} isTvaApplicable={billingSettings?.isTvaApplicable ?? true} />
    </div>
  )
}
