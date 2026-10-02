import { getClients } from "@/actions/clients"
import { getSavedViews } from "@/actions/views"
import { ClientsTable } from "./clients-table"
import { getClientDirectory } from "@/actions/directories"
import { parseDirectoryQuery } from "@/lib/directory-query"

export default async function ClientsPage({ searchParams }: PageProps<"/dashboard/clients">) {
  const params = await searchParams
  const query = parseDirectoryQuery(typeof params.view === "string" ? params.view : null)
  const [directory, views, data] = await Promise.all([getClients(undefined, 25), getSavedViews("CLIENTS"), getClientDirectory(query)])

  return (
    <div className="workspace-page">
      <ClientsTable clients={directory?.clients ?? []} propertyDefinitions={directory?.propertyDefinitions ?? []} savedViews={views ?? []} initial={{ data, query }} />
    </div>
  )
}
