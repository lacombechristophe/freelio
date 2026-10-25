import { randomUUID } from "node:crypto"
import type { PrismaClient } from "@/generated/prisma/client"

export const dashboardCollections = ["sites", "equipments", "tickets", "interventions", "contracts", "projects", "customerOrders", "deliveryNotes", "purchaseOrders", "goodsReceipts"] as const

export async function createOperationsDashboardFixture(db: PrismaClient) {
  const companyId = (await db.company.create({ data: { name: "Fictional Operations relations" } })).id
  const foreignCompanyId = (await db.company.create({ data: { name: "FOREIGN-OPERATIONS-COMPANY" } })).id
  const user = await db.user.create({ data: { email: `operations-relations-${randomUUID()}@example.test`, companyId } })
  const member = await db.membership.create({ data: { companyId, userId: user.id, role: "OWNER", status: "ACTIVE" } })
  const agency = await db.agency.create({ data: { companyId, code: "LOCAL", name: "Fictional permitted agency" } })
  const otherAgency = await db.agency.create({ data: { companyId, code: "OTHER", name: "Fictional other agency" } })
  const foreignAgency = await db.agency.create({ data: { companyId: foreignCompanyId, code: "FOREIGN", name: "FOREIGN-OPERATIONS-AGENCY" } })
  await db.agencyMembership.createMany({ data: [agency.id, foreignAgency.id].map(agencyId => ({ membershipId: member.id, agencyId })) })
  const foreignUser = await db.user.create({ data: { email: `foreign-operations-${randomUUID()}@example.test`, name: "FOREIGN-OPERATIONS-MEMBER" } })
  const foreignMember = await db.membership.create({ data: { companyId: foreignCompanyId, userId: foreignUser.id, role: "TECHNICIAN", status: "ACTIVE" } })
  const client = await db.client.create({ data: { companyId, name: "Fictional permitted client" } })
  const foreignClient = await db.client.create({ data: { companyId: foreignCompanyId, name: "FOREIGN-OPERATIONS-CLIENT" } })
  const supplier = await db.supplier.create({ data: { companyId, name: "Fictional permitted supplier" } })
  const foreignSupplier = await db.supplier.create({ data: { companyId: foreignCompanyId, name: "FOREIGN-OPERATIONS-SUPPLIER" } })
  const product = await db.product.create({ data: { companyId, supplierId: supplier.id, sku: "LOCAL", label: "Fictional permitted product" } })
  const foreignProduct = await db.product.create({ data: { companyId: foreignCompanyId, sku: "FOREIGN", label: "FOREIGN-OPERATIONS-PRODUCT" } })
  const warehouse = await db.warehouse.create({ data: { companyId, agencyId: agency.id, code: "LOCAL", name: "Fictional permitted warehouse" } })
  const destinationWarehouse = await db.warehouse.create({ data: { companyId, agencyId: agency.id, code: "DESTINATION", name: "Fictional permitted destination" } })
  const foreignWarehouse = await db.warehouse.create({ data: { companyId: foreignCompanyId, agencyId: foreignAgency.id, code: "FOREIGN", name: "FOREIGN-OPERATIONS-WAREHOUSE" } })
  const site = await db.customerSite.create({ data: { companyId, clientId: client.id, agencyId: agency.id, label: "Fictional permitted site", address1: "12 rue fictive" } })
  const equipment = await db.equipment.create({ data: { companyId, siteId: site.id, productId: product.id, label: "Fictional permitted equipment" } })
  const project = await db.project.create({ data: { companyId, clientId: client.id, agencyId: agency.id, siteId: site.id, name: "Fictional permitted project" } })
  const ticket = await db.serviceTicket.create({ data: { companyId, clientId: client.id, siteId: site.id, equipmentId: equipment.id, assignedMembershipId: member.id, number: "LOCAL", title: "Fictional permitted ticket", description: "Fictional diagnostic" } })
  const contract = await db.maintenanceContract.create({ data: { companyId, clientId: client.id, siteId: site.id, number: "LOCAL", label: "Fictional permitted maintenance", startDate: new Date("2030-01-02T12:00:00Z") } })
  const intervention = await db.fieldIntervention.create({ data: { companyId, siteId: site.id, projectId: project.id, ticketId: ticket.id, maintenanceContractId: contract.id, assignedMembershipId: member.id, title: "Fictional permitted intervention", scheduledStart: new Date("2030-01-02T12:00:00Z") } })
  const order = await db.customerOrder.create({ data: { companyId, clientId: client.id, projectId: project.id, number: "LOCAL" } })
  const delivery = await db.deliveryNote.create({ data: { companyId, customerOrderId: order.id, projectId: project.id, number: "LOCAL" } })
  const purchase = await db.purchaseOrder.create({ data: { companyId, supplierId: supplier.id, projectId: project.id, approvedByMembershipId: member.id, number: "LOCAL" } })
  const line = await db.purchaseOrderLine.create({ data: { purchaseOrderId: purchase.id, productId: product.id, label: "Fictional permitted line", quantity: 1, unitPriceCents: 100 } })
  await db.purchaseOrderLine.create({ data: { purchaseOrderId: purchase.id, label: "Fictional free line", quantity: 1, unitPriceCents: 100 } })
  const receipt = await db.goodsReceipt.create({ data: { companyId, purchaseOrderId: purchase.id, warehouseId: warehouse.id, number: "LOCAL" } })
  const positive = { sites: site.id, equipments: equipment.id, tickets: ticket.id, interventions: intervention.id, contracts: contract.id, projects: project.id, customerOrders: order.id, deliveryNotes: delivery.id, purchaseOrders: purchase.id, goodsReceipts: receipt.id }
  const badSite = await db.customerSite.create({ data: { companyId, clientId: foreignClient.id, agencyId: agency.id, label: "Fictional incoherent site", address1: "12 rue fictive" } })
  const badProject = await db.project.create({ data: { companyId, clientId: foreignClient.id, agencyId: agency.id, name: "Fictional incoherent project" } })
  const badOrder = await db.customerOrder.create({ data: { companyId, clientId: foreignClient.id, projectId: badProject.id, number: "BAD" } })
  const badPurchase = await db.purchaseOrder.create({ data: { companyId, supplierId: foreignSupplier.id, projectId: badProject.id, number: "BAD" } })
  const negative = {
    sites: badSite.id,
    equipments: (await db.equipment.create({ data: { companyId, siteId: badSite.id, label: "Fictional incoherent equipment" } })).id,
    tickets: (await db.serviceTicket.create({ data: { companyId, clientId: foreignClient.id, siteId: badSite.id, number: "BAD", title: "Fictional incoherent ticket", description: "Fictional diagnostic" } })).id,
    interventions: (await db.fieldIntervention.create({ data: { companyId, siteId: badSite.id, projectId: badProject.id, title: "Fictional incoherent intervention", scheduledStart: new Date("2030-01-02T12:00:00Z") } })).id,
    contracts: (await db.maintenanceContract.create({ data: { companyId, clientId: foreignClient.id, siteId: badSite.id, number: "BAD", label: "Fictional incoherent maintenance", startDate: new Date("2030-01-02T12:00:00Z") } })).id,
    projects: badProject.id, customerOrders: badOrder.id,
    deliveryNotes: (await db.deliveryNote.create({ data: { companyId, customerOrderId: badOrder.id, number: "BAD" } })).id,
    purchaseOrders: badPurchase.id,
    goodsReceipts: (await db.goodsReceipt.create({ data: { companyId, purchaseOrderId: badPurchase.id, warehouseId: warehouse.id, number: "BAD" } })).id,
  }
  const extra = [
    { key: "equipments", name: "equipment product of another company", id: (await db.equipment.create({ data: { companyId, siteId: site.id, productId: foreignProduct.id, label: "Fictional foreign product equipment" } })).id },
    { key: "tickets", name: "ticket assignee of another company", id: (await db.serviceTicket.create({ data: { companyId, clientId: client.id, siteId: site.id, assignedMembershipId: foreignMember.id, number: "FOREIGN-MEMBER", title: "Fictional foreign assignee ticket", description: "Fictional diagnostic" } })).id },
    { key: "goodsReceipts", name: "receipt warehouse of another company", id: (await db.goodsReceipt.create({ data: { companyId, purchaseOrderId: purchase.id, warehouseId: foreignWarehouse.id, number: "FOREIGN-WAREHOUSE" } })).id },
  ] as const
  // Deliberate inconsistencies verify nested includes independently of root rows.
  const foreignEquipment = await db.equipment.create({ data: { companyId: foreignCompanyId, siteId: site.id, label: "FOREIGN-OPERATIONS-EQUIPMENT" } })
  await db.maintenanceContractEquipment.createMany({ data: [equipment.id, foreignEquipment.id, extra[0].id].map(equipmentId => ({ contractId: contract.id, equipmentId })) })
  const childIntervention = await db.fieldIntervention.create({ data: { companyId, ticketId: ticket.id, siteId: site.id, assignedMembershipId: foreignMember.id, title: "FOREIGN-OPERATIONS-INTERVENTION", scheduledStart: new Date("2030-01-02T12:00:00Z") } })
  await db.serviceTicket.create({ data: { companyId: foreignCompanyId, clientId: foreignClient.id, siteId: site.id, number: "FOREIGN-CHILD", title: "FOREIGN-OPERATIONS-TICKET", description: "Fictional diagnostic" } })
  await db.maintenanceContract.create({ data: { companyId: foreignCompanyId, clientId: foreignClient.id, siteId: site.id, renewedFromId: contract.id, number: "FOREIGN-CHILD", label: "FOREIGN-OPERATIONS-MAINTENANCE", startDate: new Date("2030-01-02T12:00:00Z") } })
  await db.contract.create({ data: { companyId: foreignCompanyId, clientId: foreignClient.id, maintenanceContractId: contract.id, number: "FOREIGN-RENEWAL", title: "FOREIGN-OPERATIONS-RENEWAL", content: "Fictional diagnostic" } })
  const goodExpense = await db.expense.create({ data: { companyId, interventionId: intervention.id, label: "Fictional operational expense", amountCents: 100, date: new Date("2030-01-02"), category: "Matériel" } })
  await db.expense.create({ data: { companyId, clientId: foreignClient.id, interventionId: intervention.id, label: "FOREIGN-OPERATIONS-EXPENSE", amountCents: 100, date: new Date("2030-01-02"), category: "Matériel" } })
  await db.interventionReservation.createMany({ data: [
    { companyId, interventionId: intervention.id, title: "Fictional permitted reservation" },
    { companyId: foreignCompanyId, interventionId: intervention.id, title: "FOREIGN-OPERATIONS-RESERVATION" },
  ] })
  const goodMovement = await db.stockMovement.create({ data: { companyId, productId: product.id, warehouseId: warehouse.id, fieldInterventionId: intervention.id, type: "OUT", quantity: 1 } })
  await db.stockMovement.create({ data: { companyId, productId: foreignProduct.id, warehouseId: warehouse.id, fieldInterventionId: intervention.id, type: "OUT", quantity: 1 } })
  const goodReceiptLine = await db.goodsReceiptLine.create({ data: { goodsReceiptId: receipt.id, purchaseOrderLineId: line.id, productId: product.id, quantity: 1 } })
  await db.goodsReceiptLine.create({ data: { goodsReceiptId: receipt.id, productId: foreignProduct.id, quantity: 1 } })
  const goodIssue = await db.purchaseIssue.create({ data: { companyId, purchaseOrderId: purchase.id, purchaseOrderLineId: line.id, goodsReceiptLineId: goodReceiptLine.id, productId: product.id, type: "DAMAGED", quantity: 1 } })
  await db.purchaseIssue.create({ data: { companyId, purchaseOrderId: purchase.id, purchaseOrderLineId: line.id, goodsReceiptLineId: goodReceiptLine.id, productId: foreignProduct.id, type: "DAMAGED", quantity: 1, notes: "FOREIGN-OPERATIONS-ISSUE" } })
  const returnMovement = await db.stockMovement.create({ data: { companyId, productId: product.id, warehouseId: warehouse.id, type: "OUT", quantity: 1 } })
  const goodReturn = await db.supplierReturn.create({ data: { companyId, purchaseOrderId: purchase.id, purchaseOrderLineId: line.id, productId: product.id, supplierId: supplier.id, warehouseId: warehouse.id, stockMovementId: returnMovement.id, number: "LOCAL", quantity: 1, unitCostCents: 100, reason: "Fictional return" } })
  const badReturnMovement = await db.stockMovement.create({ data: { companyId, productId: product.id, warehouseId: foreignWarehouse.id, type: "OUT", quantity: 9 } })
  await db.supplierReturn.create({ data: { companyId, purchaseOrderId: purchase.id, purchaseOrderLineId: line.id, productId: product.id, supplierId: supplier.id, warehouseId: foreignWarehouse.id, stockMovementId: badReturnMovement.id, number: "FOREIGN", quantity: 9, unitCostCents: 100, reason: "FOREIGN-OPERATIONS-RETURN" } })
  const renewed = await db.maintenanceContract.create({ data: { companyId, clientId: client.id, siteId: site.id, renewedFromId: contract.id, number: "RENEWED", label: "Fictional renewed maintenance", startDate: new Date("2031-01-02T12:00:00Z") } })
  const proposal = await db.contract.create({ data: { companyId, clientId: client.id, maintenanceContractId: contract.id, number: "RENEWAL", title: "Fictional renewal proposal", content: "Fictional diagnostic" } })
  const recurring = await db.recurringInvoice.create({ data: { companyId, clientId: client.id, projectId: project.id, maintenanceContractId: contract.id, label: "Fictional recurring invoice", frequency: "ANNUALLY", nextGenDate: new Date("2031-01-02"), template: {} } })
  const otherSite = await db.customerSite.create({ data: { companyId, clientId: client.id, agencyId: otherAgency.id, label: "Fictional other agency site", address1: "12 rue fictive" } })
  const otherIntervention = await db.fieldIntervention.create({ data: { companyId, siteId: otherSite.id, ticketId: ticket.id, title: "Fictional other agency intervention", scheduledStart: new Date("2030-01-02T12:00:00Z") } })
  const optionalEquipment = await db.equipment.create({ data: { companyId, siteId: site.id, label: "Fictional equipment without product" } })
  const optionalTicket = await db.serviceTicket.create({ data: { companyId, clientId: client.id, number: "OPTIONAL", title: "Fictional ticket without site or assignee", description: "Fictional diagnostic" } })
  const optionalPurchase = await db.purchaseOrder.create({ data: { companyId, supplierId: supplier.id, number: "OPTIONAL" } })
  const reservation = await db.stockReservation.create({ data: { companyId, productId: product.id, warehouseId: warehouse.id, customerOrderId: order.id, quantity: 1 } })
  await db.stockReservation.create({ data: { companyId, productId: foreignProduct.id, warehouseId: warehouse.id, customerOrderId: order.id, quantity: 1 } })
  await db.deliveryNote.create({ data: { companyId: foreignCompanyId, customerOrderId: order.id, number: "FOREIGN-CHILD" } })
  const stockTransfer = await db.stockTransfer.create({ data: { companyId, productId: product.id, fromWarehouseId: warehouse.id, toWarehouseId: destinationWarehouse.id, quantity: 1 } })
  const badTransfer = await db.stockTransfer.create({ data: { companyId, productId: product.id, fromWarehouseId: warehouse.id, toWarehouseId: foreignWarehouse.id, quantity: 1 } })
  async function snapshot() {
    const where = { companyId: { in: [companyId, foreignCompanyId] } }
    return Promise.all([
      db.customerSite.findMany({ where, orderBy: { id: "asc" } }), db.equipment.findMany({ where, orderBy: { id: "asc" } }),
      db.serviceTicket.findMany({ where, orderBy: { id: "asc" } }), db.fieldIntervention.findMany({ where, orderBy: { id: "asc" } }),
      db.maintenanceContract.findMany({ where, orderBy: { id: "asc" } }), db.project.findMany({ where, orderBy: { id: "asc" } }),
      db.customerOrder.findMany({ where, orderBy: { id: "asc" } }), db.deliveryNote.findMany({ where, orderBy: { id: "asc" } }),
      db.purchaseOrder.findMany({ where, orderBy: { id: "asc" } }), db.goodsReceipt.findMany({ where, orderBy: { id: "asc" } }),
      db.auditLog.count({ where: { userId: user.id } }), db.emailDelivery.count({ where }),
    ])
  }
  async function cleanup() {
    const where = { companyId: { in: [companyId, foreignCompanyId] } }
    await db.purchaseIssue.deleteMany({ where })
    await db.supplierReturn.deleteMany({ where })
    await db.goodsReceipt.deleteMany({ where })
    await db.deliveryNote.deleteMany({ where })
    await db.stockMovement.deleteMany({ where })
    await db.stockTransfer.deleteMany({ where })
    await db.stockReservation.deleteMany({ where })
    await db.customerOrder.deleteMany({ where })
    await db.purchaseOrder.deleteMany({ where })
    await db.expense.deleteMany({ where })
    await db.fieldIntervention.deleteMany({ where })
    await db.serviceTicket.deleteMany({ where })
    await db.maintenanceContract.updateMany({ where, data: { currentRenewalProposalId: null, acceptedRenewalProposalId: null } })
    await db.contract.deleteMany({ where })
    await db.recurringInvoice.deleteMany({ where })
    await db.maintenanceContract.deleteMany({ where })
    await db.equipment.deleteMany({ where })
    await db.project.deleteMany({ where })
    await db.customerSite.deleteMany({ where })
    await db.warehouse.deleteMany({ where })
    await db.product.deleteMany({ where })
    await db.supplier.deleteMany({ where })
    await db.client.deleteMany({ where })
    await db.company.deleteMany({ where: { id: where.companyId } })
    await db.user.deleteMany({ where: { id: { in: [user.id, foreignUser.id] } } })
  }
  return { companyId, foreignCompanyId, user, member, agency, otherAgency, foreignAgency, site, ticket, positive, negative, extra,
    foreignEquipment, childIntervention, goodExpense, goodMovement, goodReceiptLine, goodIssue, otherSite, otherIntervention,
    optionalEquipment, optionalTicket, optionalPurchase, reservation, stockTransfer, badTransfer, goodReturn, renewed, proposal, recurring,
    foreignClient, foreignMember, foreignProduct, project, purchase, line, snapshot, cleanup }
}
