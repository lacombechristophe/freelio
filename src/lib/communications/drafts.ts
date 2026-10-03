import "server-only"
import { randomUUID } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { z } from "zod"
import prisma from "@/lib/prisma"
import { sanitizeSequenceEmailHtml } from "@/lib/automations/email"
import { withProcessorLease, type ProcessorLeaseControl } from "@/lib/processing/lease"
import { copyRecipientsSchema, validateRecipients } from "./recipients"

const optionalId = z.union([z.string().cuid(), z.literal(""), z.null()]).optional().transform(value => value || null)
const fieldsSchema = z.object({
  channelId: optionalId, contactId: optionalId, threadId: optionalId,
  subject: z.string().trim().max(180).refine(value => !/[\r\n]/.test(value), "Objet invalide"),
  bodyHtml: z.string().trim().max(100_000),
  cc: copyRecipientsSchema.default([]), bcc: copyRecipientsSchema.default([]),
})
const saveSchema = fieldsSchema.extend({
  id: z.string().cuid().optional(), version: z.number().int().positive().optional(), createKey: z.string().uuid(),
})
const identitySchema = z.object({ id: z.string().cuid(), version: z.number().int().positive() })
const acceptedStatuses = ["SENT", "DELIVERED", "OPENED", "CLICKED"]

export class EmailDraftConflict extends Error {}

function normalizedFields(input: unknown) {
  const fields = fieldsSchema.parse(input)
  return { ...fields, bodyHtml: sanitizeSequenceEmailHtml(fields.bodyHtml) }
}

async function locked<T>(id: string, task: (control: ProcessorLeaseControl) => Promise<T>) {
  const result = await withProcessorLease(`email-draft:${id}`, task)
  if (!result.acquired) throw new EmailDraftConflict("Ce brouillon est utilisé dans un autre onglet ; réessayez après actualisation")
  return result.value
}

async function assertLinks(companyId: string, fields: z.output<typeof fieldsSchema>) {
  if (fields.channelId && !await prisma.communicationChannel.findFirst({ where: { id: fields.channelId, companyId }, select: { id: true } })) throw new Error("Boîte du brouillon inaccessible")
  const contact = fields.contactId ? await prisma.contact.findFirst({ where: { id: fields.contactId, client: { companyId } }, select: { clientId: true, email: true } }) : null
  if (fields.contactId && !contact) throw new Error("Contact du brouillon inaccessible")
  validateRecipients(contact?.email || null, fields.cc, fields.bcc)
  if (fields.threadId && !await prisma.emailThread.findFirst({ where: { id: fields.threadId, companyId, ...(contact ? { clientId: contact.clientId } : {}), ...(fields.channelId ? { channelId: fields.channelId } : {}) }, select: { id: true } })) throw new Error("Conversation du brouillon inaccessible")
}

function dto(draft: Awaited<ReturnType<typeof readEmailDraft>>) {
  return { ...draft, cc: copyRecipientsSchema.parse(draft.cc), bcc: copyRecipientsSchema.parse(draft.bcc), createdAt: draft.createdAt.toISOString(), updatedAt: draft.updatedAt.toISOString(), sentAt: draft.sentAt?.toISOString() ?? null }
}

export async function readEmailDraft(companyId: string, userId: string, id: string) {
  const draft = await prisma.emailDraft.findFirst({ where: { companyId, authorUserId: userId, id: z.string().cuid().parse(id) } })
  if (!draft) throw new Error("Brouillon introuvable")
  return draft
}

export async function getEmailDraft(companyId: string, userId: string, id: string) {
  return dto(await readEmailDraft(companyId, userId, id))
}

export async function listEmailDrafts(companyId: string, userId: string, input: unknown = {}) {
  const { page: requested } = z.object({ page: z.number().int().min(1).max(100_000).default(1) }).parse(input)
  return prisma.$transaction(async tx => {
    const where = { companyId, authorUserId: userId, sentAt: null }
    const total = await tx.emailDraft.count({ where })
    const pageCount = Math.max(1, Math.ceil(total / 25)), page = Math.min(requested, pageCount)
    const rows = await tx.emailDraft.findMany({ where, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], skip: (page - 1) * 25, take: 25,
      select: { id: true, version: true, subject: true, updatedAt: true } })
    return { total, page, pageCount, drafts: rows.map(row => ({ ...row, updatedAt: row.updatedAt.toISOString() })) }
  })
}

export async function saveEmailDraft(companyId: string, userId: string, input: unknown) {
  const data = saveSchema.parse(input)
  const fields = normalizedFields(data)
  await assertLinks(companyId, fields)
  if (!data.id) return locked(`${companyId}:${userId}:${data.createKey}`, async control => {
    await control.assertOwned()
    const draft = await prisma.emailDraft.upsert({ where: { companyId_authorUserId_createKey: { companyId, authorUserId: userId, createKey: data.createKey } }, update: {},
      create: { companyId, authorUserId: userId, createKey: data.createKey, requestKey: randomUUID(), ...fields } })
    if (draft.sentAt || draft.version !== 1 || !isDeepStrictEqual(fieldsSchema.parse(draft), fields)) throw new EmailDraftConflict("Cette création de brouillon existe déjà avec un autre contenu ; rouvrez-la")
    return dto(draft)
  })
  return locked(data.id, async control => {
    const draft = await readEmailDraft(companyId, userId, data.id!)
    if (draft.version !== data.version) throw new EmailDraftConflict("Conflit : ce brouillon a changé dans un autre onglet. Votre texte est conservé ; rouvrez la version enregistrée")
    if (draft.sentAt || await prisma.emailDelivery.count({ where: { companyId, requestKey: draft.requestKey } })) throw new EmailDraftConflict("Un envoi est déjà préparé pour ce brouillon ; reprenez son résultat avant de le modifier")
    await control.assertOwned()
    const saved = await prisma.emailDraft.updateMany({ where: { id: draft.id, companyId, authorUserId: userId, version: data.version, sentAt: null }, data: { ...fields, version: { increment: 1 }, requestKey: randomUUID() } })
    if (saved.count !== 1) throw new EmailDraftConflict("Conflit : le brouillon n’a pas pu être sauvegardé")
    return dto(await readEmailDraft(companyId, userId, draft.id))
  })
}

export async function deleteEmailDraft(companyId: string, userId: string, input: unknown) {
  const data = identitySchema.parse(input)
  return locked(data.id, async control => {
    const draft = await readEmailDraft(companyId, userId, data.id)
    const delivery = await prisma.emailDelivery.findFirst({ where: { companyId, requestKey: draft.requestKey }, select: { status: true } })
    if (delivery && !acceptedStatuses.includes(delivery.status)) throw new EmailDraftConflict("Résultat de l’envoi à vérifier avant de supprimer ce brouillon")
    await control.assertOwned()
    const removed = await prisma.emailDraft.deleteMany({ where: { companyId, authorUserId: userId, id: data.id, version: data.version } })
    if (removed.count !== 1) throw new EmailDraftConflict("Conflit : ce brouillon a changé ; actualisez avant de le supprimer")
    return { success: true as const }
  })
}

export async function sendEmailDraft<T>(companyId: string, userId: string, input: unknown, send: (requestKey: string) => Promise<T>) {
  const identity = identitySchema.parse(input)
  return locked(identity.id, async control => {
    const draft = await readEmailDraft(companyId, userId, identity.id)
    if (draft.version !== identity.version || !isDeepStrictEqual(fieldsSchema.parse(draft), normalizedFields(input))) throw new EmailDraftConflict("Conflit : enregistrez et vérifiez le brouillon avant l’envoi")
    await assertLinks(companyId, fieldsSchema.parse(draft))
    await control.assertOwned()
    const result = await send(draft.requestKey)
    await control.assertOwned()
    await prisma.emailDraft.updateMany({ where: { companyId, authorUserId: userId, id: draft.id, version: draft.version }, data: { sentAt: new Date() } })
    return result
  })
}

export type EmailDraftDto = Awaited<ReturnType<typeof getEmailDraft>>
export type EmailDraftPage = Awaited<ReturnType<typeof listEmailDrafts>>
