import { z } from "zod"
import { MAX_EMAIL_FILE_BYTES } from "./attachment-types"

export const remoteAttachmentSchema = z.object({
  id: z.string().min(1).max(2048).refine(id => ![".", ".."].includes(id) && !/[\x00-\x1f\x7f]/.test(id)), name: z.string().min(1).max(180), type: z.string().max(200), size: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  kind: z.enum(["GMAIL_ATTACHMENT", "GMAIL_PART", "GRAPH_FILE", "UNSUPPORTED"]), inline: z.boolean(),
})
export const remoteMailObservationSchema = z.object({
  presence: z.enum(["PRESENT", "MISSING"]), read: z.boolean().nullable(), folderIds: z.array(z.string().max(2048)).max(1000),
  folderNames: z.array(z.string().max(200)).max(1000).default([]),
  checkedAt: z.string().datetime(), attachments: z.array(remoteAttachmentSchema).max(2000), attachmentsComplete: z.boolean(),
})
export type RemoteMailObservation = z.infer<typeof remoteMailObservationSchema>
export type RemoteMailAttachment = z.infer<typeof remoteAttachmentSchema>
export type ExternalMailMessage = {
  providerConversationId?: string | null;
  providerId: string; direction: "INBOUND" | "OUTBOUND"; internetMessageId: string | null; inReplyTo: string | null;
  from: string; to: string[]; cc: string[]; bcc: string[]; subject: string; bodyHtml: string | null; bodyText: string | null;
  occurredAt: Date; unread: boolean; draft: boolean; observation: RemoteMailObservation;
}
export function remoteAttachmentRefusal(file: RemoteMailAttachment) {
  if (file.kind === "UNSUPPORTED" || !["application/pdf", "image/png", "image/jpeg"].includes(file.type)) return "Type de pièce non pris en charge"
  if (file.size <= 0 || file.size > MAX_EMAIL_FILE_BYTES) return "Téléchargement limité à 5 Mo par pièce"
  return null
}
export function remoteFileName(value: string | undefined) {
  return (value || "Pièce sans nom").replace(/[\x00-\x1f\x7f/\\]/g, "_").slice(0, 180) || "Pièce sans nom"
}
