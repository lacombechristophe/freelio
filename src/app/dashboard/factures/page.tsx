import { getInvoices } from "@/actions/factures"
import { FacturesTable } from "./factures-table"
import { getInvoiceDirectory } from "@/actions/directories"
import { parseDirectoryQuery } from "@/lib/directory-query"


export default async function FacturesPage({ searchParams }: PageProps<"/dashboard/factures">) {
  const params = await searchParams
  const query = parseDirectoryQuery(typeof params.view === "string" ? params.view : null)
  // Preserve the existing recurring-invoice processing once on page entry.
  await getInvoices(undefined, 1)
  const data = await getInvoiceDirectory(query)

  return (
    <div className="workspace-page">
      <FacturesTable invoices={data.rows} initial={{ data, query }} />
    </div>
  )
}
