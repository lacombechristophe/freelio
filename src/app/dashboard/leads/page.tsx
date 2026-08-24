import { getLeadDashboard } from "@/actions/leads"
import { PageHeader } from "@/components/shared/page-header"

import { LeadInbox } from "./lead-inbox"

export default async function LeadsPage() {
  const data = await getLeadDashboard()
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Acquisition"
        title="Prospects entrants"
        description="Centralisez les demandes du site public, leur attribution commerciale et la preuve de consentement."
      />
      <LeadInbox initialData={data} />
    </div>
  )
}
