import { getQuotes } from "@/actions/devis"
import { DevisTable } from "./devis-table"
import { PageHeader } from "@/components/shared/page-header"

export default async function DevisPage() {
  const quotes = await getQuotes()

  return (
    <div className="space-y-7">
      <PageHeader eyebrow="Vente" title="Devis" description="Préparez vos propositions, suivez leur statut et transformez les accords en factures sans ressaisie." />
      <DevisTable quotes={quotes ?? []} />
    </div>
  )
}
