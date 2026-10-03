import { z } from "zod"

export const MAX_EMAIL_FILE_BYTES = 5 * 1024 * 1024
export const MAX_EMAIL_ATTACHMENT_BYTES = 10 * 1024 * 1024
export const emailAttachmentMetadataSchema = z.object({
  id: z.string().uuid(), name: z.string().min(1).max(180).refine(value => !/[\x00-\x1f\x7f/\\]/.test(value), "Nom de fichier invalide"),
  size: z.number().int().positive().max(MAX_EMAIL_FILE_BYTES),
  type: z.enum(["application/pdf", "image/png", "image/jpeg"]), sha256: z.string().regex(/^[a-f0-9]{64}$/),
})
export const emailAttachmentSchema = emailAttachmentMetadataSchema.extend({ relativePath: z.string().min(1).max(1000) })
export const emailAttachmentsSchema = z.array(emailAttachmentSchema).max(5).refine(files => files.reduce((total, file) => total + file.size, 0) <= MAX_EMAIL_ATTACHMENT_BYTES, "10 Mo maximum par e-mail")
  .refine(files => new Set(files.map(file => file.id)).size === files.length && new Set(files.map(file => file.sha256)).size === files.length, "Pièce jointe déjà présente")
export type EmailAttachment = z.infer<typeof emailAttachmentSchema>
export type EmailAttachmentMetadata = z.infer<typeof emailAttachmentMetadataSchema>

export function attachmentMetadata(files: EmailAttachment[]) {
  return files.map(file => emailAttachmentMetadataSchema.parse(file))
}
