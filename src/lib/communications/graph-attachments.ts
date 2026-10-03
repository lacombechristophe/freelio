import "server-only"
import { createHash } from "node:crypto"
import { providerFetch as fetch } from "@/lib/integrations/provider-fetch"
import { readBoundedStream } from "@/lib/bounded-file-read"
import type { LoadedEmailAttachment } from "./attachment-content"

// Completed attachments are reconciled by their actual bytes, not just a name.
// An incomplete upload session may expire; retrying starts a new session only
// after proving that its attachment has not already completed on this draft.
export async function prepareGraphAttachments(draftId: string, headers: Record<string, string>, files: LoadedEmailAttachment[], assertOwned: () => Promise<void>) {
  const endpoint = `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(draftId)}/attachments`
  async function reconcile() {
    await assertOwned()
    const response = await fetch(`${endpoint}?$select=id,name,size,contentId&$top=6`, { headers })
    const result = await response.json() as { value?: Array<{ id: string; name: string; size: number; contentId?: string }>; "@odata.nextLink"?: string }
    if (!response.ok || !Array.isArray(result.value) || result.value.length > 5 || result["@odata.nextLink"]) throw new Error("Pièces du brouillon Microsoft à vérifier")
    const found = new Set<string>()
    for (const remote of result.value) {
      const candidates = files.filter(file => remote.contentId ? remote.contentId === `freelio-${file.id}` : remote.name === file.name && remote.size === file.size)
      if (!candidates.length || candidates.every(file => file.size !== remote.size)) throw new Error("Le brouillon Microsoft contient une pièce étrangère ou modifiée")
      const content = await fetch(`${endpoint}/${encodeURIComponent(remote.id)}/$value`, { headers })
      if (!content.ok || !content.body) throw new Error("Pièce Microsoft inaccessible ; aucun envoi")
      const bytes = await readBoundedStream(content.body as unknown as AsyncIterable<Uint8Array>, Math.max(...candidates.map(file => file.size)))
      const sha256 = createHash("sha256").update(bytes).digest("hex")
      const match = candidates.find(file => file.sha256 === sha256 && file.size === bytes.length && file.name === remote.name)
      if (!match || found.has(match.id)) throw new Error("Pièce Microsoft altérée ou dupliquée ; aucun envoi")
      found.add(match.id)
    }
    return found
  }
  const completed = await reconcile()
  for (const file of files) {
    if (completed.has(file.id)) continue
    await assertOwned()
    if (file.size < 3_000_000) {
      const response = await fetch(endpoint, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ "@odata.type": "#microsoft.graph.fileAttachment", name: file.name, contentType: file.type, contentId: `freelio-${file.id}`, isInline: false, contentBytes: file.bytes.toString("base64") }) })
      if (!response.ok) throw new Error(`Ajout de pièce Microsoft refusé (${response.status})`)
    } else {
      const response = await fetch(`${endpoint}/createUploadSession`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ AttachmentItem: { attachmentType: "file", name: file.name, contentType: file.type, contentId: `freelio-${file.id}`, isInline: false, size: file.size } }) })
      const session = await response.json() as { uploadUrl?: string }
      if (!response.ok || !session.uploadUrl) throw new Error("Session de pièce Microsoft indisponible")
      const url = new URL(session.uploadUrl)
      if (url.origin !== "https://outlook.office.com" || url.username || url.password || url.hash || !url.pathname.startsWith("/api/v2.0/")) throw new Error("Destination de transfert Microsoft invalide")
      for (let offset = 0; offset < file.size; offset += 3 * 320 * 1024) {
        await assertOwned()
        const end = Math.min(offset + 3 * 320 * 1024, file.size)
        const uploaded = await fetch(url, { method: "PUT", headers: { "content-type": "application/octet-stream", "content-length": String(end - offset), "content-range": `bytes ${offset}-${end - 1}/${file.size}` }, body: new Uint8Array(file.bytes.subarray(offset, end)) })
        if (uploaded.status !== (end === file.size ? 201 : 200)) throw new Error(`Transfert de pièce Microsoft à reprendre (${uploaded.status})`)
      }
    }
  }
  if ((await reconcile()).size !== files.length) throw new Error("Pièces Microsoft incomplètes ; aucun envoi")
}
