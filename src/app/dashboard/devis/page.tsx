import { getQuoteDirectory } from "@/actions/directories"
import { parseDirectoryQuery } from "@/lib/directory-query"
import { getSavedViews } from "@/actions/views"
import { DevisTable } from "./devis-table"

export default async function DevisPage({ searchParams }: PageProps<"/dashboard/devis">) {
  const params = await searchParams
  const query = parseDirectoryQuery(typeof params.view === "string" ? params.view : null)
  const [data, views] = await Promise.all([getQuoteDirectory(query), getSavedViews("QUOTES")])

  return (
    <div className="workspace-page">
      <DevisTable quotes={data.rows} savedViews={views ?? []} initial={{ data, query }} />
    </div>
  )
}
