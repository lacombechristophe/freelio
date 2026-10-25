"use client"
import type { EmailDraftDto } from "./drafts"
import { emailAttachmentMetadataSchema } from "./attachment-types"

async function draftResponse(response: Response) {
  const result = await response.json() as { error?: string; draft?: EmailDraftDto }
  if (!response.ok || !result.draft) throw new Error(result.error || "Transfert impossible ; rouvrez le brouillon")
  return result.draft
}
export async function uploadEmailAttachment(draft: EmailDraftDto, file: File) {
  const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer())), byte => byte.toString(16).padStart(2, "0")).join("")
  const metadata = emailAttachmentMetadataSchema.parse({ id: crypto.randomUUID(), name: file.name, type: file.type, size: file.size, sha256 })
  const endpoint = `/api/communications/drafts/${draft.id}/attachments`
  const presign = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "presign", version: draft.version, file: metadata }) })
  const prepared = await presign.json() as { error?: string; direct?: boolean; upload?: { uploadUrl: string; storageKey: string; headers: Record<string, string> } }
  if (!presign.ok) throw new Error(prepared.error || "Préparation du transfert impossible")
  if (!prepared.direct || !prepared.upload) {
    const body = new FormData(); body.set("file", file); body.set("version", String(draft.version)); body.set("uploadId", metadata.id)
    return draftResponse(await fetch(endpoint, { method: "POST", body }))
  }
  const upload = prepared.upload
  try {
    const response = await fetch(upload.uploadUrl, { method: "PUT", headers: upload.headers, body: file })
    if (!response.ok) throw new Error("Le stockage a refusé le fichier")
    return await draftResponse(await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "complete", version: draft.version, file: metadata, storageKey: upload.storageKey }) }))
  } catch (error) {
    await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "abort", version: draft.version, file: metadata, storageKey: upload.storageKey }) }).catch(() => undefined)
    throw error
  }
}
export async function removeEmailAttachment(draft: EmailDraftDto, attachmentId: string) {
  return draftResponse(await fetch(`/api/communications/drafts/${draft.id}/attachments`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: draft.version, attachmentId }) }))
}
