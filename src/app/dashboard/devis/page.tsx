import { getQuotes } from "@/actions/devis"
import { getSavedViews } from "@/actions/views"
import { DevisTable } from "./devis-table"
import { PageHeader } from "@/components/shared/page-header"

export default async function DevisPage() {
  const [quotes, views] = await Promise.all([getQuotes(), getSavedViews("QUOTES")])

  return (
    <div className="workspace-page">
      <PageHeader className="workspace-page-header" eyebrow="Vente" title="Devis" description="Préparez vos propositions, suivez leur statut et transformez les accords en factures sans ressaisie." />
      <DevisTable quotes={quotes ?? []} savedViews={views ?? []} />
    </div>
  )
}
