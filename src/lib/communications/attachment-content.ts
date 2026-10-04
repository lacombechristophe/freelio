import "server-only"
import { createHash } from "node:crypto"
import { hasExpectedSignature, readLocalFile } from "@/lib/local-files"
import type { EmailAttachment } from "./attachment-types"

export type LoadedEmailAttachment = EmailAttachment & { bytes: Buffer }
export async function readEmailAttachmentBytes(companyId: string, file: EmailAttachment): Promise<LoadedEmailAttachment> {
  if (!["local:", "r2:"].some(prefix => file.relativePath.startsWith(`${prefix}private/${companyId}/email-draft/`))) throw new Error("Pièce jointe hors de la société")
  const bytes = await readLocalFile(file.relativePath, file.size)
  if (bytes.length !== file.size || createHash("sha256").update(bytes).digest("hex") !== file.sha256 || !hasExpectedSignature(file.type, bytes)) throw new Error("Pièce jointe altérée : envoi refusé")
  return { ...file, bytes }
}
