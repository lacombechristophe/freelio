import "server-only"

import { createHash } from "node:crypto"
import { Prisma, type CustomerOrder } from "@prisma/client"
import { z } from "zod"
import type { TransactionClient } from "@/lib/prisma"
import type { AuthContext } from "@/lib/auth-wrapper"
import { encrypt, decrypt } from "@/lib/crypto"
import { inlinePdfFonts } from "@/lib/pdf/generator"
import { renderDeliveryNoteHtml } from "@/lib/pdf/delivery-render"
import { operationsDashboardScope } from "./dashboard-scope"

type Context = Pick<AuthContext, "companyId" | "agencyIds">
const projectSelect = { id: true, clientId: true, site: { select: { clientId: true, label: true, address1: true, address2: true, postalCode: true, city: true } } } as const
const relations = { client: { select: { id: true, name: true, address: true } }, project: { select: projectSelect }, quote: { select: { clientId: true, projectId: true } } } as const
const hash = (value: string) => createHash("sha256").update(value).digest("hex")
const SLOT = "__FREELIO_DELIVERY_SEAL__"
export const deliveryChanged = "La commande ou le bon de livraison a changé. Rechargez la page puis réessayez ; votre saisie est conservée."
export function deliveryRevision(value: unknown) { return hash(JSON.stringify(value)) }

type OrderRelations = { clientId: string; projectId: string | null; project: { clientId: string; site: { clientId: string } | null } | null; quote: { clientId: string; projectId: string | null } | null }
function coherentOrder(order: OrderRelations) {
  return (!order.project || order.project.clientId === order.clientId && (!order.project.site || order.project.site.clientId === order.clientId))
    && (!order.quote || order.quote.clientId === order.clientId && (!order.quote.projectId || order.quote.projectId === order.projectId))
}

export function deliverableOrderWhere(context: Context) {
  return { ...operationsDashboardScope(context.companyId, context.agencyIds).customerOrder, status: { notIn: ["CANCELED", "CANCELLED", "DRAFT", "DELIVERED"] } }
}

export async function readCustomerDeliveryOrder(db: TransactionClient, context: Context, id: string) {
  const order = await db.customerOrder.findFirst({ where: { id, ...deliverableOrderWhere(context) }, include: relations })
  return order && coherentOrder(order) ? order : null
}

export async function readCustomerDeliveryLine(db: TransactionClient, context: Context, orderId: string, lineId: string) {
  const line = await db.customerOrderLine.findFirst({ where: { id: lineId, customerOrderId: orderId, customerOrder: deliverableOrderWhere(context) },
    include: { customerOrder: { include: relations } },
  })
  return line && coherentOrder(line.customerOrder) ? line : null
}

export async function readDeliveryRecord(db: TransactionClient, context: Context, id: string) {
  const note = await db.deliveryNote.findFirst({ where: { id, ...operationsDashboardScope(context.companyId, context.agencyIds).deliveryNote },
    include: {
      company: { select: { name: true, address: true, email: true, phone: true, siret: true } },
      customerOrder: { include: relations },
      lines: { orderBy: { id: "asc" }, include: { customerOrderLine: { select: { customerOrderId: true, productId: true } } } },
    },
  })
  if (!note || !coherentOrder(note.customerOrder) || note.projectId && note.projectId !== note.customerOrder.projectId) return null
  if (note.lines.some(line => !Number.isFinite(line.quantity) || line.quantity <= 0 || line.customerOrderLine && (line.customerOrderLine.customerOrderId !== note.customerOrderId || line.customerOrderLine.productId !== line.productId))) return null
  return note
}

export async function lockCustomerDeliveryOrder(tx: TransactionClient, context: Context, order: CustomerOrder) {
  const locked = await tx.customerOrder.updateMany({ where: { id: order.id, ...operationsDashboardScope(context.companyId, context.agencyIds).customerOrder, status: order.status, updatedAt: order.updatedAt }, data: { updatedAt: order.updatedAt } })
  if (locked.count !== 1) throw new Error(deliveryChanged)
}

export function nextDeliveredQuantity(line: { quantity: number; deliveredQuantity: number }, quantity: number) {
  if (!Number.isFinite(line.quantity) || !Number.isFinite(line.deliveredQuantity) || line.quantity <= 0 || line.deliveredQuantity < 0 || !Number.isFinite(quantity) || quantity <= 0) throw new Error("Quantités de livraison invalides")
  const next = new Prisma.Decimal(line.deliveredQuantity).plus(quantity)
  if (next.greaterThan(line.quantity)) throw new Error("La quantité dépasse le reliquat de livraison")
  return next.toNumber()
}

const sealSchema = z.object({ version: z.literal(1), id: z.string().cuid(), companyId: z.string(), customerOrderId: z.string().cuid(), clientId: z.string().cuid(), number: z.string(), signedAt: z.string().datetime(), recipientName: z.string(), html: z.string().max(6 * 1024 * 1024) }).strict()
type Note = NonNullable<Awaited<ReturnType<typeof readDeliveryRecord>>>
export async function prepareDeliverySeal(note: Note, recipientName: string, signedAt: Date) {
  const rendered = renderDeliveryNoteHtml({ ...note, status: "SIGNED", signedAt, recipientName, signatureSha256: SLOT,
    client: note.customerOrder.client, order: note.customerOrder, site: note.customerOrder.project?.site,
  })
  const html = await inlinePdfFonts(rendered, true)
  if (html.split(SLOT).length !== 2 || Buffer.byteLength(html) > 6 * 1024 * 1024) throw new Error("Contenu du bon incompatible avec le scellement")
  const snapshot = sealSchema.parse({ version: 1, id: note.id, companyId: note.companyId, customerOrderId: note.customerOrderId, clientId: note.customerOrder.clientId, number: note.number, signedAt: signedAt.toISOString(), recipientName, html })
  const plain = JSON.stringify(snapshot)
  return { signedDocument: encrypt(plain), signatureSha256: hash(plain), sealVersion: 1 }
}

export function readDeliverySeal(note: Pick<Note, "id" | "companyId" | "customerOrderId" | "number" | "recipientName" | "signedDocument" | "sealVersion" | "signatureSha256" | "signedAt"> & { clientId: string }) {
  if (!note.signedAt || !note.signedDocument || note.sealVersion !== 1 || !note.signatureSha256) throw new Error("Archive historique indisponible")
  const plain = decrypt(note.signedDocument)
  if (Buffer.byteLength(plain) > 7 * 1024 * 1024 || hash(plain) !== note.signatureSha256) throw new Error("Capture du bon de livraison altérée")
  const snapshot = sealSchema.parse(JSON.parse(plain))
  if (snapshot.id !== note.id || snapshot.companyId !== note.companyId || snapshot.customerOrderId !== note.customerOrderId || snapshot.clientId !== note.clientId || snapshot.number !== note.number || snapshot.recipientName !== note.recipientName || snapshot.signedAt !== note.signedAt.toISOString() || snapshot.html.split(SLOT).length !== 2) throw new Error("Capture du bon de livraison hors périmètre")
  return snapshot.html.replace(SLOT, note.signatureSha256)
}
