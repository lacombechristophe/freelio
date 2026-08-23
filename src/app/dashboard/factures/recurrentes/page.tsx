import { getClientsMinimal } from "@/actions/clients"
import { getRecurringInvoices } from "@/actions/factures"
import { RecurringInvoicesView } from "./recurring-invoices-view"

export const dynamic = "force-dynamic"

export default async function RecurringInvoicesPage() {
  const [recurring, clients] = await Promise.all([
    getRecurringInvoices(),
    getClientsMinimal(),
  ])
  return <RecurringInvoicesView recurring={recurring ?? []} clients={clients ?? []} />
}
