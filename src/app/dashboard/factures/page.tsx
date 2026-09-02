import { getInvoices } from "@/actions/factures"
import { FacturesTable } from "./factures-table"
import { PageHeader, PageHeaderStat } from "@/components/shared/page-header"

export default async function FacturesPage() {
  const invoices = await getInvoices()

  const totalEncours = (invoices ?? [])
    .filter((i) => i.status === "SENT" || i.status === "OVERDUE")
    .reduce((sum, i) => sum + (i.totalTtcCents - i.paidAmountCents), 0)

  return (
    <div className="workspace-page">
      <PageHeader
        className="workspace-page-header"
        eyebrow="Encaissements"
        title="Factures"
        description="Émettez des factures Factur-X, suivez les règlements et identifiez immédiatement ce qui reste à encaisser."
        actions={<PageHeaderStat label="En attente" value={new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(totalEncours / 100)} />}
      />
      <FacturesTable invoices={invoices ?? []} />
    </div>
  )
}
