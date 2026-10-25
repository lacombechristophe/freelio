import "server-only"

import type { Prisma } from "@/generated/prisma/client"
import type { AgencyAccess } from "@/lib/agency-access"

// Includes do not inherit the Prisma extension's tenant/agency predicates.
// Keep the predicates shared by root collections and their nested counters.
export function operationsDashboardScope(companyId: string, agencyIds: AgencyAccess) {
  const agency = { companyId, ...(agencyIds === null ? {} : { id: { in: agencyIds } }) }
  const agencyRelation = agencyIds === null
    ? { OR: [{ agencyId: null }, { agency }] }
    : { agency }
  const site = { companyId, client: { companyId }, ...agencyRelation } satisfies Prisma.CustomerSiteWhereInput
  const warehouse = { companyId, ...agencyRelation } satisfies Prisma.WarehouseWhereInput
  const product = { companyId, OR: [{ supplierId: null }, { supplier: { companyId } }] } satisfies Prisma.ProductWhereInput
  const membership = { companyId }
  const project = { companyId, client: { companyId }, AND: [agencyRelation, { OR: [{ siteId: null }, { site }] }] } satisfies Prisma.ProjectWhereInput
  const equipment = { companyId, site, OR: [{ productId: null }, { product }] } satisfies Prisma.EquipmentWhereInput
  const ticket = { companyId, client: { companyId }, AND: [
    { OR: [{ siteId: null }, { site }] },
    { OR: [{ equipmentId: null }, { equipment }] },
    { OR: [{ assignedMembershipId: null }, { assignedMembership: membership }] },
    { OR: [{ mergedIntoTicketId: null }, { mergedInto: { companyId, client: { companyId } } }] },
  ] } satisfies Prisma.ServiceTicketWhereInput
  const maintenance = { companyId, client: { companyId }, site } satisfies Prisma.MaintenanceContractWhereInput
  const recurring = { companyId, client: { companyId }, OR: [{ projectId: null }, { project }] } satisfies Prisma.RecurringInvoiceWhereInput
  const contract = { ...maintenance, AND: [
    { OR: [{ renewedFromId: null }, { renewedFrom: maintenance }] },
    { OR: [{ recurringInvoice: { is: null } }, { recurringInvoice: recurring }] },
    { OR: [{ currentRenewalProposalId: null }, { currentRenewalProposal: { companyId, client: { companyId } } }] },
    { OR: [{ acceptedRenewalProposalId: null }, { acceptedRenewalProposal: { companyId, client: { companyId } } }] },
  ] } satisfies Prisma.MaintenanceContractWhereInput
  const intervention = { companyId, site, AND: [
    { OR: [{ ticketId: null }, { ticket }] },
    { OR: [{ projectId: null }, { project }] },
    { OR: [{ assignedMembershipId: null }, { assignedMembership: membership }] },
    { OR: [{ maintenanceContractId: null }, { maintenanceContract: maintenance }] },
  ] } satisfies Prisma.FieldInterventionWhereInput
  const quote = { companyId, client: { companyId }, OR: [{ projectId: null }, { project }] } satisfies Prisma.QuoteWhereInput
  const orderLine = { OR: [{ productId: null }, { product }] }
  const customerOrder = { companyId, client: { companyId }, lines: { every: orderLine }, AND: [
    { OR: [{ projectId: null }, { project }] },
    { OR: [{ quoteId: null }, { quote }] },
  ] } satisfies Prisma.CustomerOrderWhereInput
  const purchaseOrder = { companyId, supplier: { companyId }, lines: { every: orderLine }, AND: [
    { OR: [{ projectId: null }, { project }] },
    { OR: [{ approvedByMembershipId: null }, { approvedByMembership: membership }] },
  ] } satisfies Prisma.PurchaseOrderWhereInput
  const purchaseReference = { companyId, supplier: { companyId }, OR: [{ projectId: null }, { project }] } satisfies Prisma.PurchaseOrderWhereInput
  const purchaseLine = { purchaseOrder: purchaseReference, ...orderLine } satisfies Prisma.PurchaseOrderLineWhereInput
  const deliveryNote = { companyId, customerOrder, AND: [
    { OR: [{ projectId: null }, { project }] },
    { lines: { every: { AND: [orderLine, { OR: [{ customerOrderLineId: null }, { customerOrderLine: { customerOrder, ...orderLine } }] }] } } },
  ] } satisfies Prisma.DeliveryNoteWhereInput
  const goodsReceipt = { companyId, purchaseOrder, warehouse } satisfies Prisma.GoodsReceiptWhereInput
  const receiptReference = { companyId, warehouse, purchaseOrder: purchaseReference } satisfies Prisma.GoodsReceiptWhereInput
  const receiptLine = { goodsReceipt: receiptReference, AND: [orderLine, { OR: [{ purchaseOrderLineId: null }, { purchaseOrderLine: purchaseLine }] }] } satisfies Prisma.GoodsReceiptLineWhereInput
  const reservation = { companyId, warehouse, product, AND: [
    { OR: [{ projectId: null }, { project }] },
    { OR: [{ customerOrderId: null }, { customerOrder }] },
  ] } satisfies Prisma.StockReservationWhereInput
  const stockTransfer = { companyId, product, fromWarehouse: warehouse, toWarehouse: warehouse } satisfies Prisma.StockTransferWhereInput
  const stockMovement = { companyId, product, warehouse, AND: [
    { OR: [{ projectId: null }, { project }] },
    { OR: [{ reservationId: null }, { reservation }] },
    { OR: [{ stockTransferId: null }, { stockTransfer }] },
  ] } satisfies Prisma.StockMovementWhereInput
  // Child queries already sit below an authorized parent. Check their own
  // references without recursively embedding the entire parent's graph again.
  const supplierReturn = { companyId, supplier: { companyId }, purchaseOrder: purchaseReference, purchaseOrderLine: purchaseLine, product, warehouse,
    stockMovement: { companyId, product, warehouse } } satisfies Prisma.SupplierReturnWhereInput
  const purchaseIssue = { companyId, purchaseOrder: purchaseReference, purchaseOrderLine: purchaseLine, AND: [
    orderLine, { OR: [{ goodsReceiptLineId: null }, { goodsReceiptLine: { goodsReceipt: receiptReference } }] },
  ] } satisfies Prisma.PurchaseIssueWhereInput
  const invoice = { companyId, client: { companyId }, OR: [{ projectId: null }, { project }] } satisfies Prisma.InvoiceWhereInput
  const expense = { companyId, AND: [
    { OR: [{ clientId: null }, { client: { companyId } }] },
    { OR: [{ projectId: null }, { project }] },
  ] } satisfies Prisma.ExpenseWhereInput
  return { agency, site, warehouse, product, project, equipment, ticket, contract, intervention, membership, maintenanceReference: maintenance,
    customerOrder, purchaseOrder, deliveryNote, goodsReceipt, receiptLine, reservation, stockTransfer, stockMovement, supplierReturn, purchaseIssue, invoice, expense }
}
