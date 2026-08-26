import { getClients } from "@/actions/clients"
import { getSavedViews } from "@/actions/views"
import { ClientsTable } from "./clients-table"
import { PageHeader } from "@/components/shared/page-header"

export default async function ClientsPage() {
  const [clients, views] = await Promise.all([getClients(), getSavedViews("CLIENTS")])

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Portefeuille"
        title="Clients"
        description="Centralisez les contacts, le chiffre d’affaires, les impayés et l’historique de chaque relation."
      />
      <ClientsTable clients={clients ?? []} savedViews={views ?? []} />
    </div>
  )
}
