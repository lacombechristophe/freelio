"use server"

import { revalidatePath } from "next/cache"
import { withAuth } from "@/lib/auth-wrapper"
import { logAction } from "@/lib/audit"
import {
  buildYearlyDocumentPrefix,
  readCompanyDocumentNumbers,
  nextDocumentNumber,
  withDocumentNumberRetry,
} from "@/lib/document-numbering"
import { computeInvoiceSlice, remainingOrderAmount } from "@/lib/operations/orders"
import { operationsDashboardScope } from "@/lib/operations/dashboard-scope"
import prisma from "@/lib/prisma"
import { calculateCommercialDocument } from "@/lib/finance/commercial-calculation"
import {
  readCustomerDeliveryLine,
  readDeliveryRecord,
  lockCustomerDeliveryOrder,
  deliveryRevision,
  deliveryChanged,
  nextDeliveredQuantity,
  prepareDeliverySeal,
  readDeliverySeal,
} from "@/lib/operations/customer-deliveries"
import { convertAcceptedQuote } from "@/lib/operations/quote-conversion"
import {
  customerOrderSchema,
  quoteToCustomerOrderSchema,
  deliveryNoteSchema,
  deliverySignatureSchema,
  customerOrderInvoiceSchema,
} from "./schemas"
import { revalidateOperations } from "./revalidation"

export async function createCustomerOrder(input: unknown) {
  return withAuth(async context => {
    const { companyId, userId, agencyIds } = context
    const data = customerOrderSchema.parse(input)
    const scope = operationsDashboardScope(companyId, agencyIds)
    if (agencyIds !== null && !data.projectId) throw new Error("Un chantier accessible est requis pour cette commande")
    const prefix = buildYearlyDocumentPrefix("CMD-", "CMD-")
    const order = await withDocumentNumberRetry(async () => {
      const last = await readCompanyDocumentNumbers(() => prisma.customerOrder.findMany({ where: { companyId, number: { startsWith: prefix } }, select: { number: true } }))
      return prisma.$transaction(async tx => {
        const [client, project, product, company] = await Promise.all([
          tx.client.findFirst({ where: { id: data.clientId, companyId }, select: { id: true } }),
          data.projectId ? tx.project.findFirst({ where: { id: data.projectId, ...scope.project, clientId: data.clientId, status: "ACTIVE" }, select: { id: true, site: { select: { clientId: true } } } }) : null,
          data.productId ? tx.product.findFirst({ where: { id: data.productId, ...scope.product, active: true }, select: { id: true } }) : null,
          tx.company.findUniqueOrThrow({ where: { id: companyId }, select: { isTvaApplicable: true } }),
        ])
        if (!client) throw new Error("Client introuvable")
        if (data.projectId && (!project || project.site && project.site.clientId !== data.clientId)) throw new Error("Le chantier n'appartient pas à ce client ou n’est plus actif")
        if (data.productId && !product) throw new Error("Produit introuvable ou inactif")
        const tvaRate = company.isTvaApplicable ? data.tvaRate : 0
        const totals = calculateCommercialDocument([{ ...data, tvaRate }])
        if (data.depositCents > totals.totalTtcCents) throw new Error("L'acompte dépasse le total de la commande")
        const created = await tx.customerOrder.create({ data: { companyId, clientId: data.clientId, projectId: data.projectId, number: nextDocumentNumber(last, prefix), acceptedAt: new Date(),
          expectedInstallationAt: data.expectedInstallationAt, notes: data.notes, totalHtCents: totals.totalHtCents, totalTvaCents: totals.totalTvaCents, totalTtcCents: totals.totalTtcCents, depositCents: data.depositCents,
          lines: { create: { productId: data.productId, label: data.label, quantity: data.quantity, unitPriceCents: data.unitPriceCents, tvaRate } },
        } })
        await tx.auditLog.create({ data: { userId, action: "CREATE_CUSTOMER_ORDER", resource: "CUSTOMER_ORDER", resourceId: created.id, payload: { number: created.number, totalHtCents: totals.totalHtCents, totalTtcCents: totals.totalTtcCents } } })
        return created
      }, { isolationLevel: "Serializable" })
    }, { label: "la commande client" })
    revalidateOperations()
    return { success: true as const, id: order.id, number: order.number }
  }, "operations.write")
}

export async function convertQuoteToCustomerOrder(input: unknown) {
  return withAuth(async context => {
    const data = quoteToCustomerOrderSchema.parse(typeof input === "string" ? { quoteId: input } : input)
    const result = await convertAcceptedQuote(context, data)
    revalidateOperations()
    revalidatePath("/dashboard/devis")
    revalidatePath(`/dashboard/devis/${data.quoteId}`)
    return result
  }, "sales.write")
}

export async function createInvoiceFromCustomerOrder(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = customerOrderInvoiceSchema.parse(input)
    const order = await prisma.customerOrder.findFirst({
      where: { id: data.customerOrderId, companyId, client: { companyId }, OR: [{ projectId: null }, { project: { companyId, client: { companyId } } }] },
      include: { project: { select: { clientId: true } }, invoices: { select: { id: true, companyId: true, clientId: true, projectId: true, number: true, type: true, status: true, totalTtcCents: true } } },
    })
    if (!order || (order.project && order.project.clientId !== order.clientId)) throw new Error("Commande client introuvable")
    if (order.invoices.some(invoice => invoice.companyId !== companyId || invoice.clientId !== order.clientId || invoice.projectId !== order.projectId)) throw new Error("Commande client introuvable")
    const orderScope = {
      id: order.id, companyId, clientId: order.clientId, projectId: order.projectId,
      client: { companyId },
      OR: [{ projectId: null }, { project: { companyId, clientId: order.clientId, client: { companyId } } }],
      invoices: { every: { companyId, clientId: order.clientId, projectId: order.projectId } },
    }
    const invoiceRead = { id: true, type: true, status: true, totalTtcCents: true } as const
    const invoiceState = (invoices: Array<{ id: string; type: string; status: string; totalTtcCents: number }>) =>
      JSON.stringify([...invoices].sort((a, b) => a.id.localeCompare(b.id)).map(invoice => [invoice.id, invoice.type, invoice.status, invoice.totalTtcCents]))
    const expectedInvoiceState = invoiceState(order.invoices)
    if (order.status === "CANCELLED") throw new Error("Une commande annulée ne peut pas être facturée")
    if (data.mode === "DEPOSIT") {
      const existingDeposit = order.invoices.find((invoice) => invoice.type === "DEPOSIT" && invoice.status !== "CANCELLED")
      if (existingDeposit) {
        const current = await prisma.customerOrder.findFirst({ where: orderScope, select: { invoices: { select: invoiceRead } } })
        if (!current) throw new Error("Commande client introuvable")
        if (invoiceState(current.invoices) !== expectedInvoiceState) throw new Error("La facturation de cette commande a changé. Rechargez la page puis réessayez.")
        return { success: true as const, id: existingDeposit.id, number: existingDeposit.number, existing: true as const }
      }
      if (order.depositCents <= 0) throw new Error("Aucun acompte n’est défini sur cette commande")
    }
    const remaining = remainingOrderAmount(order.totalTtcCents, order.invoices)
    const amountTtcCents = data.mode === "DEPOSIT" ? Math.min(order.depositCents, remaining) : remaining
    if (amountTtcCents <= 0) throw new Error("Cette commande est déjà entièrement facturée")
    const totals = computeInvoiceSlice({ orderHtCents: order.totalHtCents, orderTvaCents: order.totalTvaCents, orderTtcCents: order.totalTtcCents, amountTtcCents })
    const company = await prisma.company.findFirst({ where: { id: companyId }, select: { invoicePrefix: true } })
    if (!company) throw new Error("Entreprise introuvable")
    const prefix = buildYearlyDocumentPrefix(company.invoicePrefix, "FACT-")
    const dueDate = new Date()
    dueDate.setDate(dueDate.getDate() + data.dueDays)
    const type = data.mode === "DEPOSIT" ? "DEPOSIT" : "STANDARD"
    const label = data.mode === "DEPOSIT" ? `Acompte sur commande ${order.number}` : `Solde de la commande ${order.number}`

    const invoice = await withDocumentNumberRetry(
      async () => {
    const last = await readCompanyDocumentNumbers(() => prisma.invoice.findMany({ where: { companyId, number: { startsWith: prefix } }, select: { number: true } }))
        return prisma.$transaction(async (tx) => {
          const current = await tx.customerOrder.findFirst({ where: orderScope, select: { invoices: { select: invoiceRead } } })
          if (!current) throw new Error("Commande client introuvable")
          if (invoiceState(current.invoices) !== expectedInvoiceState) throw new Error("La facturation de cette commande a changé. Rechargez la page puis réessayez.")
          const nextRemaining = remaining - amountTtcCents
          const claimed = await tx.customerOrder.updateMany({
            where: { ...orderScope, updatedAt: order.updatedAt, billingStatus: order.billingStatus },
            data: { billingStatus: nextRemaining <= 0 ? "INVOICED" : "PARTIALLY_INVOICED" },
          })
          if (claimed.count !== 1) throw new Error("La facturation de cette commande a changé. Rechargez la page puis réessayez.")
          const created = await tx.invoice.create({
            data: {
              companyId,
              clientId: order.clientId,
              projectId: order.projectId,
              customerOrderId: order.id,
              number: nextDocumentNumber(last, prefix),
              object: label,
              type,
              status: "DRAFT",
              dueDate,
              totalHtCents: totals.totalHtCents,
              totalTvaCents: totals.totalTvaCents,
              totalTtcCents: totals.totalTtcCents,
              lines: { create: { label, quantity: 1, unitPriceCents: totals.totalHtCents, tvaRate: totals.tvaRate } },
            },
          })
          return created
        })
      },
      { label: data.mode === "DEPOSIT" ? "la facture d’acompte" : "la facture de solde" },
    )
    await logAction({
      userId,
      action: "CREATE_INVOICE_FROM_ORDER",
      resource: "INVOICE",
      resourceId: invoice.id,
      payload: { customerOrderId: order.id, mode: data.mode, amountTtcCents },
    })
    revalidateOperations()
    revalidatePath("/dashboard/factures")
    return { success: true as const, id: invoice.id, number: invoice.number, existing: false as const }
  }, "finance.write")
}

export async function createDeliveryNote(input: unknown) {
  return withAuth(async context => {
    const { companyId, userId } = context
    const data = deliveryNoteSchema.parse(input)
    const line = await readCustomerDeliveryLine(prisma, context, data.customerOrderId, data.customerOrderLineId)
    if (!line) throw new Error("Ligne de commande client introuvable")
    nextDeliveredQuantity(line, data.quantity)
    const prefix = buildYearlyDocumentPrefix("BL-", "BL-")
    const note = await withDocumentNumberRetry(async () => prisma.$transaction(async tx => {
      const fresh = await readCustomerDeliveryLine(tx, context, data.customerOrderId, data.customerOrderLineId)
      if (!fresh || deliveryRevision(fresh) !== deliveryRevision(line)) throw new Error(deliveryChanged)
      await lockCustomerDeliveryOrder(tx, context, fresh.customerOrder)
      const deliveredQuantity = nextDeliveredQuantity(fresh, data.quantity)
      const last = await readCompanyDocumentNumbers(() => tx.deliveryNote.findMany({ where: { companyId, number: { startsWith: prefix } }, select: { number: true } }))
      const claimed = await tx.customerOrderLine.updateMany({ where: { id: line.id, customerOrderId: data.customerOrderId, quantity: line.quantity, deliveredQuantity: line.deliveredQuantity, productId: line.productId }, data: { deliveredQuantity } })
      if (claimed.count !== 1) throw new Error(deliveryChanged)
      const created = await tx.deliveryNote.create({ data: { companyId, customerOrderId: data.customerOrderId, projectId: line.customerOrder.projectId, number: nextDocumentNumber(last, prefix), status: "DELIVERED", deliveredAt: new Date(), recipientName: data.recipientName, notes: data.notes,
        lines: { create: { customerOrderLineId: line.id, productId: line.productId, label: line.label, quantity: data.quantity } },
      } })
      const lines = await tx.customerOrderLine.findMany({ where: { customerOrderId: data.customerOrderId }, select: { quantity: true, deliveredQuantity: true } })
      if (lines.every(item => item.deliveredQuantity >= item.quantity)) await tx.customerOrder.update({ where: { id: data.customerOrderId }, data: { status: "DELIVERED" } })
      await tx.auditLog.create({ data: { userId, action: "CREATE_DELIVERY_NOTE", resource: "DELIVERY_NOTE", resourceId: created.id, payload: { number: created.number, customerOrderId: data.customerOrderId, quantity: data.quantity } } })
      return created
    }, { isolationLevel: "Serializable" }), { label: "le bon de livraison" })
    revalidateOperations()
    return { success: true as const, id: note.id, number: note.number }
  }, "operations.write")
}

export async function signDeliveryNote(input: unknown) {
  return withAuth(async context => {
    const { companyId, userId } = context
    const data = deliverySignatureSchema.parse(input)
    const note = await readDeliveryRecord(prisma, context, data.deliveryNoteId)
    if (!note) throw new Error("Bon de livraison introuvable")
    if (note.signedAt || note.status === "SIGNED" || note.signatureSha256) {
      readDeliverySeal({ ...note, clientId: note.customerOrder.clientId })
      if (note.recipientName !== data.recipientName) throw new Error("Ce bon de livraison a déjà été signé par un autre réceptionnaire")
      return { success: true as const, alreadySigned: true, signatureSha256: note.signatureSha256! }
    }
    if (note.status !== "DELIVERED" || !note.deliveredAt || !note.lines.length) throw new Error("Le bon doit être livré avant sa signature")
    const signedAt = new Date(), seal = await prepareDeliverySeal(note, data.recipientName, signedAt)
    await prisma.$transaction(async tx => {
      const fresh = await readDeliveryRecord(tx, context, note.id)
      if (!fresh || deliveryRevision(fresh) !== deliveryRevision(note)) throw new Error(deliveryChanged)
      await lockCustomerDeliveryOrder(tx, context, fresh.customerOrder)
      const claimed = await tx.deliveryNote.updateMany({ where: { id: note.id, companyId, status: "DELIVERED", signedAt: null, updatedAt: note.updatedAt },
        data: { status: "SIGNED", recipientName: data.recipientName, signedAt, ...seal },
      })
      if (claimed.count !== 1) throw new Error(deliveryChanged)
      await tx.auditLog.create({ data: { userId, action: "SIGN_DELIVERY_NOTE", resource: "DELIVERY_NOTE", resourceId: note.id, payload: { number: note.number, recipientName: data.recipientName, signatureSha256: seal.signatureSha256, sealVersion: 1 } } })
    }, { isolationLevel: "Serializable" })
    revalidateOperations()
    return { success: true as const, signatureSha256: seal.signatureSha256 }
  }, "operations.write")
}
