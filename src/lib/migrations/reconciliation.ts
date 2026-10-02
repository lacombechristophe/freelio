import "server-only"
import { Prisma } from "@prisma/client"
import { migrationDatabase as prisma } from "@/lib/migrations/database"
import { COMPANY_SCOPED_MODELS, companyRelationScope } from "@/lib/tenant-scope"
import { associationIds, invoiceCandidate, quoteCandidate, paymentCandidate, lineItemCandidate, type SourcePayload } from "@/lib/migrations/normalize"

const targets = new Set([
  "Client", "Contact", "CustomerSite", "Supplier", "Product", "Warehouse", "Opportunity",
  "ServiceTicket", "Equipment", "FieldIntervention", "MaintenanceContract", "Project",
  "PurchaseOrder", "CustomerOrder", "DeliveryNote", "GoodsReceipt", "StockMovement",
  "StockReservation", "Quote", "Invoice", "InvoicePayment", "ClientActivity",
  "InvoiceLine", "QuoteLine", "CustomerOrderLine", "PurchaseOrderLine",
])
type ImportedRecord = { objectType: string; sourceId: string; targetModel: string | null; targetRecordId: string | null; payload: Prisma.JsonValue }
type Issue = { severity: "ERROR"; code: string; message: string; objectType: string; details: Prisma.InputJsonValue }

export async function reconcileImportedTarget(record: ImportedRecord, companyId: string, provider: string, verifySecondaryLines = true): Promise<Issue[]> {
  const model = record.targetModel ?? ""
  const issues: Issue[] = []
  const report = (code: string, message: string, details: Prisma.InputJsonValue = {}) => {
    issues.push({ severity: "ERROR", code, message, objectType: record.objectType, details: { sourceId: record.sourceId, targetModel: model, ...details as object } })
  }
  if (!targets.has(model)) {
    report("VERIFY_TARGET_MODEL_INVALID", "Le modèle de la cible importée est inconnu.")
    return issues
  }
  const scope = COMPANY_SCOPED_MODELS.has(model) ? { companyId } : companyRelationScope(model, companyId, "")
  if (!scope) throw new Error("Missing migration target tenant scope")
  const delegateName = model[0].toLowerCase() + model.slice(1)
  const delegate = Reflect.get(prisma, delegateName) as { findFirst(args: { where: object }): Promise<Record<string, unknown> | null> }
  const target = await delegate.findFirst({ where: { id: record.targetRecordId, ...scope } })
  if (!target) {
    report("VERIFY_TARGET_MISSING", "La cible importée n’existe plus dans cette entreprise.")
    return issues
  }
  const payload = record.payload as SourcePayload
  let financial: Record<string, unknown> | null = null
  let expected: Record<string, unknown> = {}
  if (model === "Invoice") {
    financial = target
    const candidate = invoiceCandidate(payload, "")
    expected = { totalHtCents: candidate.totalHtCents, totalTvaCents: candidate.totalTvaCents, totalTtcCents: candidate.totalTtcCents }
    const lines = await prisma.invoiceLine.findMany({ where: { invoiceId: record.targetRecordId!, invoice: { companyId } } })
    const ht = lines.reduce((sum, line) => sum + Math.round(line.quantity * line.unitPriceCents), 0)
    const vat = lines.reduce((sum, line) => sum + Math.round(Math.round(line.quantity * line.unitPriceCents) * line.tvaRate / 100), 0)
    if (ht !== target.totalHtCents || vat !== target.totalTvaCents || ht + vat !== target.totalTtcCents) report("VERIFY_DOCUMENT_TOTAL_MISMATCH", "Les sommes HT/TVA/TTC des lignes ne correspondent pas à la facture importée.", { lineHtCents: ht, lineTvaCents: vat })
    const payments = await prisma.invoicePayment.aggregate({ where: { invoiceId: record.targetRecordId!, invoice: { companyId } }, _sum: { amountCents: true } })
    const expectedPaid = Math.max(candidate.paidAmountCents, payments._sum.amountCents ?? 0)
    if (target.paidAmountCents !== expectedPaid || (target.status === "PAID" && expectedPaid < candidate.totalTtcCents)) report("VERIFY_PAYMENT_TOTAL_MISMATCH", "Le montant réglé et les paiements ne correspondent pas à la facture importée.", { expectedPaidCents: expectedPaid, actualPaidCents: target.paidAmountCents as number })
  } else if (model === "Quote") {
    financial = await prisma.quoteVersion.findFirst({ where: { quoteId: record.targetRecordId!, version: Number(target.currentVersion), quote: { companyId } } })
    const candidate = quoteCandidate(payload, "")
    expected = { totalHtCents: candidate.totalHtCents, totalTvaCents: candidate.totalTvaCents, totalTtcCents: candidate.totalTtcCents }
    if (financial) {
      const lines = await prisma.quoteLine.findMany({
        where: { section: { versionId: String(financial.id), version: { quote: { companyId } } } },
      })
      const ht = lines.reduce((sum, line) => sum + Math.round(line.quantity * line.unitPriceCents), 0)
      const vat = lines.reduce((sum, line) => sum + Math.round(Math.round(line.quantity * line.unitPriceCents) * line.tvaRate / 100), 0)
      if (ht !== financial.totalHtCents || vat !== financial.totalTvaCents || ht + vat !== financial.totalTtcCents) report("VERIFY_DOCUMENT_TOTAL_MISMATCH", "Les sommes HT/TVA/TTC des lignes ne correspondent pas au devis importé.", { lineHtCents: ht, lineTvaCents: vat })
    }
  } else if (model === "InvoicePayment") {
    financial = target
    expected = { amountCents: paymentCandidate(payload).amountCents }
  } else if (["InvoiceLine", "QuoteLine", "CustomerOrderLine", "PurchaseOrderLine"].includes(model)) {
    financial = target
    const candidate = lineItemCandidate(record.objectType, payload)
    const quantity = model === "PurchaseOrderLine" ? Math.max(1, Math.round(candidate.quantity)) : model === "CustomerOrderLine" ? Math.max(0.01, candidate.quantity) : candidate.quantity
    expected = { unitPriceCents: candidate.unitPriceCents, quantity, ...(model === "PurchaseOrderLine" ? {} : { tvaRate: candidate.tvaRate }) }
  }
  for (const [field, value] of Object.entries(expected)) {
    if (!financial || financial[field] !== value) report("VERIFY_AMOUNT_MISMATCH", "Un montant ou une quantité importée diffère de la source.", { field, expected: value as number, actual: financial?.[field] as number ?? null })
  }
  for (const relation of [
    { association: "company", model: "Client", field: "clientId" },
    { association: "invoice", model: "Invoice", field: "invoiceId" },
    { association: "project", model: "Project", field: "projectId" },
    { association: "product", model: "Product", field: "productId" },
    { association: "site", model: "CustomerSite", field: "siteId" },
    { association: "warehouse", model: "Warehouse", field: "warehouseId" },
    { association: "supplier", model: "Supplier", field: "supplierId" },
    { association: "ticket", model: "ServiceTicket", field: "ticketId" },
    { association: "equipment", model: "Equipment", field: "equipmentId" },
    { association: "customerOrder", model: "CustomerOrder", field: "customerOrderId" },
    { association: "purchaseOrder", model: "PurchaseOrder", field: "purchaseOrderId" },
    { association: "quote", model: "Quote", field: "quoteId" },
    { association: "deal", model: "Opportunity", field: "opportunityId" },
  ] as const) {
    if (!(relation.field in target)) continue
    const sourceIds = associationIds(payload, relation.association)
    if (!sourceIds.length) continue
    const mappings = await prisma.externalIdMap.findMany({ where: { companyId, provider, targetModel: relation.model, sourceRecordId: { in: sourceIds } }, select: { targetRecordId: true } })
    if (!mappings.some(mapping => mapping.targetRecordId === target[relation.field])) report("VERIFY_RELATION_MISMATCH", "Une association importée ne correspond pas à sa cible source.", { field: relation.field })
  }
  if (verifySecondaryLines && ["InvoiceLine", "QuoteLine", "CustomerOrderLine", "PurchaseOrderLine"].includes(model)) {
    const sourceKey = `${provider}:${record.objectType}:${record.sourceId}`
    for (const specification of [
      { association: "invoice", parentModel: "Invoice", lineModel: "InvoiceLine", parentField: "invoiceId" },
      { association: "quote", parentModel: "Quote", lineModel: "QuoteLine", parentField: "quoteId" },
      { association: "customerOrder", parentModel: "CustomerOrder", lineModel: "CustomerOrderLine", parentField: "customerOrderId" },
      { association: "purchaseOrder", parentModel: "PurchaseOrder", lineModel: "PurchaseOrderLine", parentField: "purchaseOrderId" },
    ] as const) {
      const sourceIds = associationIds(payload, specification.association)
      if (!sourceIds.length) continue
      const mappings = await prisma.externalIdMap.findMany({ where: { companyId, provider, targetModel: specification.parentModel, sourceRecordId: { in: sourceIds } }, select: { targetRecordId: true } })
      const parentIds = mappings.map(mapping => mapping.targetRecordId)
      const parentWhere = specification.lineModel === "QuoteLine" ? { section: { version: { quoteId: { in: parentIds }, quote: { companyId } } } } : { [specification.parentField]: { in: parentIds }, ...companyRelationScope(specification.lineModel, companyId, "") }
      const siblingDelegate = Reflect.get(prisma, specification.lineModel[0].toLowerCase() + specification.lineModel.slice(1)) as typeof delegate
      const sibling = await siblingDelegate.findFirst({ where: { ...parentWhere, sourceKey } })
      if (!sibling) report("VERIFY_SECONDARY_TARGET_MISSING", "Une ligne associée à un document source n’a plus de cible correspondante.", { association: specification.association })
      else if (specification.lineModel !== model || sibling.id !== record.targetRecordId) issues.push(...await reconcileImportedTarget({ ...record, targetModel: specification.lineModel, targetRecordId: String(sibling.id) }, companyId, provider, false))
    }
  }
  return issues
}
