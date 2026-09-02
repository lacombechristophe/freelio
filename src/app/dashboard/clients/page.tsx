import { getClients } from "@/actions/clients"
import { getSavedViews } from "@/actions/views"
import { ClientsTable } from "./clients-table"
import { PageHeader } from "@/components/shared/page-header"

export default async function ClientsPage() {
  const [directory, views] = await Promise.all([getClients(undefined, 100), getSavedViews("CLIENTS")])

  return (
    <div className="workspace-page">
      <PageHeader
        className="workspace-page-header"
        eyebrow="Portefeuille"
        title="Clients"
        description="Centralisez les contacts, le chiffre d’affaires, les impayés et l’historique de chaque relation."
      />
      <ClientsTable clients={directory?.clients ?? []} propertyDefinitions={directory?.propertyDefinitions ?? []} savedViews={views ?? []} />
    </div>
  )
}
