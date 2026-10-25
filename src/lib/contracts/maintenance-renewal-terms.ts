import "server-only"

import { z } from "zod"
import { createHash } from "node:crypto"
import { indexedMaintenancePrice, nextMaintenanceTerm } from "@/lib/operations/maintenance-renewal"
import { AssetLifecycleError } from "@/lib/operations/asset-error"
import { buildMaintenanceRenewalContent } from "./structured-documents"

const cents = z.number().int().min(0).max(2147483647)
const economicSchema = z.object({
  version: z.literal(1), companyId: z.string().cuid(), maintenanceContractId: z.string().cuid(), clientId: z.string().cuid(), siteId: z.string().cuid(),
  sourceNumber: z.string().min(1), label: z.string().min(1), siteLabel: z.string().min(1),
  nextStartDate: z.string().datetime(), nextEndDate: z.string().datetime(),
  currentPriceCents: cents, nextPriceCents: cents, indexationRate: z.number().finite().min(-100).max(100),
  frequency: z.string().min(1), noticeDays: z.number().int().min(0).max(365), tvaRate: z.number().finite().min(0).max(100),
  invoiceDueDays: z.number().int().min(0).max(365), autoInvoice: z.boolean(), equipmentIds: z.array(z.string().cuid()).max(10000),
})
const termsSchema = economicSchema.extend({ bodySha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict()
export type MaintenanceRenewalTerms = z.infer<typeof termsSchema>
type Source = { id: string; companyId: string; clientId: string; siteId: string; number: string; label: string; site: { label: string };
  startDate: Date; endDate: Date | null; priceCents: number; indexationRate: number; frequency: string; noticeDays: number; tvaRate: number; invoiceDueDays: number; autoInvoice: boolean;
  equipments: { equipmentId: string }[] }

export const MAINTENANCE_TERMS_CHANGED = "Les conditions du renouvellement ont changé. Préparez une nouvelle proposition avant de poursuivre."
export const MAINTENANCE_TERMS_MISSING = "Conditions historiques indisponibles. Conservez ce document et préparez une nouvelle proposition."

export function captureMaintenanceRenewalTerms(source: Source, isTvaApplicable: boolean) {
  if (!source.endDate) throw new AssetLifecycleError("Renseignez une date de fin avant de préparer la proposition")
  const term = nextMaintenanceTerm(source.startDate, source.endDate)
  const parsed = economicSchema.safeParse({ version: 1, companyId: source.companyId, maintenanceContractId: source.id, clientId: source.clientId, siteId: source.siteId,
    sourceNumber: source.number, label: source.label, siteLabel: source.site.label, nextStartDate: term.startDate.toISOString(), nextEndDate: term.endDate.toISOString(),
    currentPriceCents: source.priceCents, nextPriceCents: indexedMaintenancePrice(source.priceCents, source.indexationRate), indexationRate: source.indexationRate,
    frequency: source.frequency, noticeDays: source.noticeDays, tvaRate: isTvaApplicable ? source.tvaRate : 0, invoiceDueDays: source.invoiceDueDays, autoInvoice: source.autoInvoice,
    equipmentIds: source.equipments.map(row => row.equipmentId).sort() })
  if (!parsed.success) throw new AssetLifecycleError("Les conditions ou le montant du renouvellement ne sont pas représentables.")
  return { ...parsed.data, bodySha256: createHash("sha256").update(maintenanceRenewalContent(parsed.data)).digest("hex") }
}

export function serializeMaintenanceRenewalTerms(terms: MaintenanceRenewalTerms) { return JSON.stringify(termsSchema.parse(terms)) }

export function readMaintenanceRenewalTerms(value: string | null | undefined) {
  if (!value) throw new AssetLifecycleError(MAINTENANCE_TERMS_MISSING)
  if (Buffer.byteLength(value) > 1024 * 1024) throw new AssetLifecycleError(MAINTENANCE_TERMS_CHANGED)
  try { return termsSchema.parse(JSON.parse(value)) } catch { throw new AssetLifecycleError(MAINTENANCE_TERMS_CHANGED) }
}

export function maintenanceRenewalContent(terms: z.infer<typeof economicSchema>) {
  return buildMaintenanceRenewalContent({ ...terms, nextStartDate: new Date(terms.nextStartDate), nextEndDate: new Date(terms.nextEndDate) })
}

export function assertMaintenanceProposalTerms(proposal: { companyId: string; clientId: string; maintenanceContractId: string | null; maintenanceRenewalTerms: string | null; content: string; validFrom: Date | null; validUntil: Date | null }) {
  const terms = readMaintenanceRenewalTerms(proposal.maintenanceRenewalTerms)
  if (terms.companyId !== proposal.companyId || terms.clientId !== proposal.clientId || terms.maintenanceContractId !== proposal.maintenanceContractId ||
    proposal.validFrom?.toISOString() !== terms.nextStartDate || proposal.validUntil?.toISOString() !== terms.nextEndDate || createHash("sha256").update(proposal.content).digest("hex") !== terms.bodySha256) throw new AssetLifecycleError(MAINTENANCE_TERMS_CHANGED)
  return terms
}

export function assertCurrentMaintenanceTerms(terms: MaintenanceRenewalTerms, source: Source, isTvaApplicable: boolean) {
  // Wording changes in a later renderer must not invalidate a frozen agreement.
  // Compare the structured economics; its original body hash is checked separately.
  if (JSON.stringify(economicSchema.parse(terms)) !== JSON.stringify(economicSchema.parse(captureMaintenanceRenewalTerms(source, isTvaApplicable)))) throw new AssetLifecycleError(MAINTENANCE_TERMS_CHANGED)
}
