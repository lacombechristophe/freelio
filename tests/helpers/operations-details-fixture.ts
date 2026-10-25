import type { PrismaClient } from "@/generated/prisma/client"
import { createOperationsDashboardFixture } from "./operations-dashboard-fixture"

export async function createOperationsDetailsFixture(db: PrismaClient) {
  const base = await createOperationsDashboardFixture(db)
  const { companyId, foreignCompanyId, ticket, member, foreignMember, foreignClient } = base
  async function cleanup() {
    await db.emailThread.deleteMany({ where: { companyId: { in: [companyId, foreignCompanyId] } } })
    await base.cleanup()
  }
  try {
    const forbiddenIds: string[] = []
    const merged = await db.serviceTicket.create({ data: { companyId, clientId: ticket.clientId, siteId: base.site.id,
      number: "MERGED", title: "Fictional merged ticket", description: ticket.description, status: "MERGED", mergedIntoTicketId: ticket.id } })
    const foreignMerged = await db.serviceTicket.create({ data: { companyId, clientId: foreignClient.id,
      number: "FOREIGN-MERGED", title: "FOREIGN-OPERATIONS-MERGED", description: ticket.description, status: "MERGED", mergedIntoTicketId: ticket.id } })
    forbiddenIds.push(foreignMerged.id)
    const notes: string[] = [], diagnostics: string[] = [], threads: string[] = []
    const shared = await db.communicationChannel.create({ data: { companyId, provider: "RESEND", visibility: "SHARED", emailAddress: "shared@example.test" } })
    const privateChannel = await db.communicationChannel.create({ data: { companyId, provider: "RESEND", visibility: "PRIVATE", ownerUserId: base.foreignMember.userId, emailAddress: "private@example.test" } })
    for (const ticketId of [ticket.id, merged.id]) {
      for (const [owner, author, marker] of [
        [companyId, member.id, "Fictional permitted"], [companyId, null, "Fictional former author"],
        [foreignCompanyId, member.id, "FOREIGN-OPERATIONS-TENANT"], [companyId, foreignMember.id, "FOREIGN-OPERATIONS-AUTHOR"],
      ] as const) {
        const note = await db.serviceTicketNote.create({ data: { companyId: owner, ticketId, authorMembershipId: author, body: marker + " note" } })
        const diagnostic = await db.serviceTicketDiagnostic.create({ data: { companyId: owner, ticketId, performedByMembershipId: author,
          guideSnapshot: { name: marker + " guide", steps: [] }, completedStepIds: [], warrantyStatus: "UNKNOWN", symptom: marker, outcome: marker } })
        if (marker.startsWith("FOREIGN")) forbiddenIds.push(note.id, diagnostic.id)
        else { notes.push(note.id); diagnostics.push(diagnostic.id) }
      }
      for (const [owner, channelId, clientId, marker] of [
        [companyId, shared.id, ticket.clientId, "Fictional permitted"],
        [foreignCompanyId, shared.id, foreignClient.id, "FOREIGN-OPERATIONS-THREAD"],
        [companyId, shared.id, foreignClient.id, "FOREIGN-OPERATIONS-THREAD-CLIENT"],
      ] as const) {
        const thread = await db.emailThread.create({ data: { companyId: owner, channelId, clientId, serviceTicketId: ticketId, subject: marker } })
        const message = await db.emailMessage.create({ data: { companyId: owner, threadId: thread.id, direction: "INBOUND", provider: "RESEND",
          fromAddress: "sender@example.test", toAddresses: ["shared@example.test"], bccAddresses: ["private-bcc@example.test"], subject: marker, bodyText: marker } })
        if (marker.startsWith("FOREIGN")) forbiddenIds.push(thread.id, message.id)
        else {
          threads.push(thread.id)
          const foreignMessage = await db.emailMessage.create({ data: { companyId: foreignCompanyId, threadId: thread.id, direction: "INBOUND", provider: "RESEND",
            fromAddress: "foreign@example.test", toAddresses: [], subject: "FOREIGN-OPERATIONS-MESSAGE" } })
          const foreignEvent = await db.emailEvent.create({ data: { companyId: foreignCompanyId, messageId: message.id, provider: "RESEND",
            providerEventId: message.id, type: "FOREIGN-OPERATIONS-EVENT", occurredAt: new Date() } })
          forbiddenIds.push(foreignMessage.id, foreignEvent.id)
        }
      }
    }
    const privateThread = await db.emailThread.create({ data: { companyId, channelId: privateChannel.id, clientId: ticket.clientId, serviceTicketId: ticket.id, subject: "Fictional private conversation" } })
    const unlinked = await db.emailThread.create({ data: { companyId: foreignCompanyId, channelId: shared.id, clientId: ticket.clientId, subject: "FOREIGN-OPERATIONS-UNLINKED" } })
    forbiddenIds.push(unlinked.id)
    const equipmentTicket = await db.serviceTicket.create({ data: { companyId, clientId: foreignClient.id, siteId: base.site.id, equipmentId: base.positive.equipments,
      number: "FOREIGN-EQUIPMENT", title: "FOREIGN-OPERATIONS-EQUIPMENT-TICKET", description: ticket.description } })
    const foreignContract = await db.maintenanceContract.create({ data: { companyId: foreignCompanyId, clientId: foreignClient.id, siteId: base.site.id,
      number: "FOREIGN-EQUIPMENT", label: "FOREIGN-OPERATIONS-EQUIPMENT-CONTRACT", startDate: new Date("2030-01-02") } })
    await db.maintenanceContractEquipment.create({ data: { contractId: foreignContract.id, equipmentId: base.positive.equipments } })
    forbiddenIds.push(equipmentTicket.id, foreignContract.id)
    const otherEquipment = await db.equipment.create({ data: { companyId, siteId: base.otherSite.id, label: "Fictional other agency equipment" } })
    const otherProject = await db.project.create({ data: { companyId, clientId: ticket.clientId, agencyId: base.otherAgency.id, name: "Fictional other agency project" } })
    const otherPurchase = await db.purchaseOrder.create({ data: { companyId, supplierId: base.purchase.supplierId, projectId: otherProject.id, number: "OTHER" } })
    const otherTicket = await db.serviceTicket.create({ data: { companyId, clientId: ticket.clientId, siteId: base.otherSite.id,
      equipmentId: base.positive.equipments, number: "OTHER", title: "Fictional other agency ticket", description: ticket.description } })
    const otherWarehouse = await db.warehouse.create({ data: { companyId, agencyId: base.otherAgency.id, code: "OTHER", name: "Fictional other agency warehouse" } })
    const otherReceipt = await db.goodsReceipt.create({ data: { companyId, purchaseOrderId: base.purchase.id, warehouseId: otherWarehouse.id, number: "OTHER" } })
    const otherReceiptLine = await db.goodsReceiptLine.create({ data: { goodsReceiptId: otherReceipt.id, purchaseOrderLineId: base.line.id, quantity: 1 } })
    const childReservation = await db.interventionReservation.create({ data: { companyId: foreignCompanyId, interventionId: base.positive.interventions, title: "FOREIGN-OPERATIONS-DETAIL-RESERVATION" } })
    forbiddenIds.push(childReservation.id)
    const file = await db.interventionFile.create({ data: { interventionId: base.positive.interventions, name: "Fictional report", url: "/fictional-report.pdf" } })
    async function snapshot() {
      const where = { companyId: { in: [companyId, foreignCompanyId] } }
      return Promise.all([base.snapshot(),
        db.serviceTicketNote.findMany({ where, orderBy: { id: "asc" } }), db.serviceTicketDiagnostic.findMany({ where, orderBy: { id: "asc" } }),
        db.emailThread.findMany({ where, include: { messages: { include: { events: true }, orderBy: { id: "asc" } } }, orderBy: { id: "asc" } }),
        db.purchaseOrderLine.findMany({ where: { purchaseOrder: where }, include: { receiptLines: true, issues: true, supplierReturns: true }, orderBy: { id: "asc" } }),
        db.interventionReservation.findMany({ where, orderBy: { id: "asc" } }), db.stockMovement.findMany({ where, orderBy: { id: "asc" } }),
        db.expense.findMany({ where, orderBy: { id: "asc" } }),
      ])
    }
    return { ...base, merged, forbiddenIds, notes, diagnostics, threads, privateThread, privateChannel, otherEquipment, otherPurchase, otherTicket,
      otherWarehouse, otherReceipt, otherReceiptLine, file, snapshot, cleanup }
  } catch (error) {
    await cleanup()
    throw error
  }
}
