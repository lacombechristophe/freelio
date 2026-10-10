import "server-only"
import { Prisma } from "@prisma/client"
import { z } from "zod"
import prisma from "@/lib/prisma"
import { getContext } from "@/lib/context"

const pageQuery = z.object({ page: z.number().int().min(1).max(1_000_000).default(1), search: z.string().trim().max(200).default("") })
const deliveryQuery = pageQuery.extend({ status: z.enum(["ALL", "SCHEDULED", "SENDING", "SENT", "DELIVERED", "OPENED", "CLICKED", "DELAYED", "FAILED", "DEAD_LETTER", "BOUNCED", "COMPLAINED", "SUPPRESSED", "CANCELED"]).default("ALL"), sequenceId: z.string().cuid().optional() })
const sequenceQuery = pageQuery.extend({ selectedId: z.string().cuid().optional() })
const deliverySelect = { id: true, recipientEmail: true, subject: true, status: true, error: true, attempts: true, maxAttempts: true, nextAttemptAt: true, deadLetteredAt: true, provider: true, scheduledAt: true, sentAt: true, createdAt: true, sequence: { select: { id: true, name: true } } } as const satisfies Prisma.EmailDeliverySelect
type Delivery = Prisma.EmailDeliveryGetPayload<{ select: typeof deliverySelect }>
const dto = (row: Delivery) => ({ ...row, scheduledAt: row.scheduledAt.toISOString(), createdAt: row.createdAt.toISOString(), sentAt: row.sentAt?.toISOString() ?? null, nextAttemptAt: row.nextAttemptAt?.toISOString() ?? null, deadLetteredAt: row.deadLetteredAt?.toISOString() ?? null })
const contains = (search: string) => ({ contains: search, ...(process.env.DATABASE_URL?.startsWith("postgres") ? { mode: "insensitive" as const } : {}) })

export async function readDeliveryJournal(companyId: string, input: unknown = {}) {
  const query = deliveryQuery.parse(input)
  const where: Prisma.EmailDeliveryWhereInput = { companyId, ...(query.status !== "ALL" ? { status: query.status } : {}), ...(query.sequenceId ? { sequenceId: query.sequenceId } : {}),
    ...(query.search ? { OR: [{ subject: contains(query.search) }, { recipientEmail: contains(query.search) }, { sequence: { name: contains(query.search) } }] } : {}) }
  return prisma.$transaction(async tx => {
    // The Prisma extension applies mailbox ACLs to both count and rows.
    const total = await tx.emailDelivery.count({ where }), pageCount = Math.max(1, Math.ceil(total / 25)), page = Math.min(query.page, pageCount)
    const rows = await tx.emailDelivery.findMany({ where, select: deliverySelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 25, take: 25 })
    return { rows: rows.map(dto), total, page, pageCount }
  }, { isolationLevel: "Serializable" })
}

export async function readDeliveryDetails(companyId: string, input: unknown) {
  const id = z.string().cuid().parse(input)
  const row = await prisma.emailDelivery.findFirst({ where: { id, companyId }, select: deliverySelect })
  return row ? dto(row) : null
}

export async function readJournalSequences(companyId: string, input: unknown = {}) {
  const query = sequenceQuery.parse(input), context = getContext()
  return prisma.$transaction(async tx => {
    const channels = context && !["OWNER", "ADMIN"].includes(context.role) ? await tx.communicationChannel.findMany({ where: { companyId }, select: { id: true } }) : null
    // senderChannelId is a historical scalar, not a Prisma relation.
    const eligible: Prisma.EmailSequenceWhereInput = { companyId, ...(channels ? { OR: [{ senderChannelId: null }, { senderChannelId: { in: channels.map(row => row.id) } }] } : {}) }
    const where: Prisma.EmailSequenceWhereInput = { AND: [eligible, ...(query.search ? [{ name: contains(query.search) }] : [])] }
    const total = await tx.emailSequence.count({ where }), pageCount = Math.max(1, Math.ceil(total / 25)), page = Math.min(query.page, pageCount)
    const rows = await tx.emailSequence.findMany({ where, select: { id: true, name: true }, orderBy: [{ name: "asc" }, { id: "asc" }], skip: (page - 1) * 25, take: 25 })
    const selected = query.selectedId ? await tx.emailSequence.findFirst({ where: { AND: [eligible, { id: query.selectedId }] }, select: { id: true, name: true } }) : null
    return { rows, selected, total, page, pageCount }
  }, { isolationLevel: "Serializable" })
}
