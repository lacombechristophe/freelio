import { getRecurringInvoices } from "@/actions/factures"
import { RecurringInvoicesView } from "./recurring-invoices-view"
import { resolveAuthContext } from "@/lib/auth-wrapper"
import { hasPermission } from "@/lib/permissions"
import { PageHeader } from "@/components/shared/page-header"

export const dynamic = "force-dynamic"

export default async function RecurringInvoicesPage() {
  const context = await resolveAuthContext()
  if (!context || !hasPermission(context.role, "finance.read")) return <div className="space-y-6">
    <PageHeader eyebrow="Automatisation" title="Facturation récurrente" description="Planifiez les échéances qui doivent générer automatiquement de nouveaux brouillons." />
    <p className="text-sm text-muted-foreground">Accès Finance requis</p>
  </div>
  return <RecurringInvoicesView initial={await getRecurringInvoices()} />
}
