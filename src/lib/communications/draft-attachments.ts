import "server-only"
import { randomUUID } from "node:crypto"
import { z } from "zod"
import prisma from "@/lib/prisma"
import { assertDemoMutationAllowed } from "@/lib/demo-policy"
import { removeLocalFile, type StoredLocalFile } from "@/lib/local-files"
import { EmailDraftConflict, getEmailDraft, readEmailDraft, withEmailDraftLease } from "./drafts"
import { emailAttachmentMetadataSchema, emailAttachmentsSchema } from "./attachment-types"

export class EmailAttachmentError extends Error {}

export async function assertEditableDraft(companyId: string, userId: string, id: string, version: number) {
  const draft = await readEmailDraft(companyId, userId, id)
  if (draft.version !== version) throw new EmailDraftConflict("Conflit : rouvrez le brouillon avant de modifier ses pièces jointes")
  if (draft.scheduledAt) throw new EmailDraftConflict("Ce brouillon est programmé ; annulez sa programmation avant de modifier ses pièces jointes")
  if (draft.sentAt || await prisma.emailDelivery.count({ where: { companyId, requestKey: draft.requestKey } })) throw new EmailDraftConflict("Un envoi est déjà préparé ; ses pièces jointes sont figées")
  return draft
}

export async function addEmailDraftAttachment(companyId: string, userId: string, id: string, version: number, input: unknown, store: () => Promise<StoredLocalFile>) {
  assertDemoMutationAllowed()
  const metadata = emailAttachmentMetadataSchema.parse(input)
  return withEmailDraftLease(id, async control => {
    const existingDraft = await readEmailDraft(companyId, userId, id)
    const current = emailAttachmentsSchema.parse(existingDraft.attachments)
    const existing = current.find(file => file.id === metadata.id)
    if (existing) {
      if (existing.sha256 !== metadata.sha256 || existing.name !== metadata.name || existing.size !== metadata.size || existing.type !== metadata.type) throw new EmailAttachmentError("Cette pièce existe avec un autre contenu")
      return getEmailDraft(companyId, userId, id)
    }
    const draft = await assertEditableDraft(companyId, userId, id, version)
    // Check both quotas and duplicates before any local or remote storage write.
    const next = emailAttachmentsSchema.safeParse([...current, { ...metadata, relativePath: "pending" }])
    if (!next.success) throw new EmailAttachmentError("Limites : 5 pièces, 5 Mo par fichier et 10 Mo au total ; aucun doublon")
    await control.assertOwned()
    const stored = await store()
    try {
      if (stored.size !== metadata.size || stored.sha256 !== metadata.sha256 || stored.type !== metadata.type) throw new EmailAttachmentError("Le fichier transféré ne correspond pas à la pièce préparée")
      const files = emailAttachmentsSchema.parse([...current, { ...metadata, relativePath: stored.relativePath }])
      await control.assertOwned()
      const saved = await prisma.emailDraft.updateMany({ where: { id, companyId, authorUserId: userId, version: draft.version, sentAt: null }, data: { attachments: files, version: { increment: 1 }, requestKey: randomUUID() } })
      if (saved.count !== 1) throw new EmailDraftConflict("Conflit : pièce non enregistrée ; rouvrez le brouillon")
    } catch (error) { await removeLocalFile(stored.relativePath); throw error }
    return getEmailDraft(companyId, userId, id)
  })
}

export async function removeEmailDraftAttachment(companyId: string, userId: string, id: string, version: number, attachmentId: string) {
  assertDemoMutationAllowed()
  z.string().uuid().parse(attachmentId)
  return withEmailDraftLease(id, async control => {
    const draft = await assertEditableDraft(companyId, userId, id, version)
    const files = emailAttachmentsSchema.parse(draft.attachments)
    const removed = files.find(file => file.id === attachmentId)
    if (!removed) throw new EmailAttachmentError("Pièce jointe introuvable")
    await control.assertOwned()
    const result = await prisma.emailDraft.updateMany({ where: { id, companyId, authorUserId: userId, version, sentAt: null }, data: { attachments: files.filter(file => file.id !== attachmentId), version: { increment: 1 }, requestKey: randomUUID() } })
    if (result.count !== 1) throw new EmailDraftConflict("Conflit : rouvrez le brouillon avant le retrait")
    await removeLocalFile(removed.relativePath).catch(() => console.error("EMAIL_ATTACHMENT_CLEANUP_FAILED", removed.id))
    return getEmailDraft(companyId, userId, id)
  })
}
