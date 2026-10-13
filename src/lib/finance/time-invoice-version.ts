import "server-only"
import { createHmac } from "node:crypto"

type TimeInvoiceVersionEntry = {
  id: string
  date: Date
  durationSec: number
  description: string | null
  isBillable: boolean
  invoiceId: string | null
  projectId: string
  project: {
    id: string
    name: string
    agencyId: string | null
    clientId: string
    client: { id: string; name: string }
  }
}

// An optimistic version of displayed billing data, never an access capability.
export function timeInvoiceVersion(
  entry: TimeInvoiceVersionEntry,
  company: { isTvaApplicable: boolean; invoicePrefix: string },
  context: { companyId: string; userId: string },
) {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error("AUTH_SECRET environment variable is required")
  return createHmac("sha256", secret).update(JSON.stringify([
    "time-invoice-preview-v1", context.companyId, context.userId,
    entry.id, entry.date.toISOString(), entry.durationSec, entry.description,
    entry.isBillable, entry.invoiceId, entry.projectId, entry.project.id,
    entry.project.name, entry.project.agencyId, entry.project.clientId,
    entry.project.client.id, entry.project.client.name,
    company.isTvaApplicable, company.invoicePrefix,
  ])).digest("hex")
}
