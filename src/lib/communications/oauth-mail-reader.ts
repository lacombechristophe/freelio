import "server-only"
import { readBodyBytes } from "@/lib/http-body"
import { providerFetch, safeMicrosoftContinuation } from "@/lib/integrations/provider-fetch"
import type { ActiveChannel } from "./email-provider"
import { remoteFileName, type ExternalMailMessage, type RemoteMailAttachment } from "./remote-mail-types"

export class MailReadError extends Error {
  constructor(public status: number) { super(`Lecture de messagerie refusée (${status})`); this.name = "MailReadError" }
}
export async function readMailJson<T>(response: Response, maxBytes = 2 * 1024 * 1024): Promise<T> {
  if (!response.ok) throw new MailReadError(response.status)
  return JSON.parse(new TextDecoder().decode(await readBodyBytes(response, maxBytes))) as T
}
export function mailHeaders(token: string) {
  return { authorization: `Bearer ${token}`, Prefer: 'IdType="ImmutableId", outlook.body-content-type="html"' }
}
export function mailResourceId(id: string) {
  if (!id || id.length > 2048 || [".", ".."].includes(id) || /[\x00-\x1f\x7f]/.test(id)) throw new Error("Identifiant fournisseur invalide")
  return encodeURIComponent(id)
}
export function microsoftMailContinuation(value: string, folder?: string) {
  const safe = safeMicrosoftContinuation(value), url = new URL(safe)
  const match = url.pathname.replace(/%27/gi, "'").match(/^\/v1\.0\/me\/mailFolders(?:\/([^/]+)|\('(.+)'\))\/messages\/delta$/i)
  if (folder && (!match || decodeURIComponent(match[1] || match[2]).replaceAll("''", "'") !== folder)) throw new Error("Curseur de messagerie Microsoft invalide")
  return safe
}
export type GmailPart = { partId?: string; filename?: string; mimeType?: string; body?: { data?: string; attachmentId?: string; size?: number }; parts?: GmailPart[]; headers?: Array<{ name: string; value: string }> }
export type GmailMessage = { id: string; internalDate?: string; labelIds?: string[]; payload?: GmailPart }
function gmailHeader(message: GmailMessage, name: string) { return message.payload?.headers?.find(header => header.name.toLowerCase() === name.toLowerCase())?.value || "" }
function gmailParts(root: GmailPart | undefined) {
  const result: GmailPart[] = [], stack = root ? [{ part: root, depth: 0 }] : []
  while (stack.length) {
    const { part, depth } = stack.pop()!
    if (depth > 30 || result.length >= 2000) throw new Error("Structure MIME trop volumineuse ; message non acquitté")
    result.push(part)
    for (const child of part.parts || []) stack.push({ part: child, depth: depth + 1 })
  }
  return result
}
const address = (value: string) => (value.match(/<([^>]+)>/)?.[1] || value).trim().toLowerCase()
const addresses = (value: string) => value.split(",").map(item => item.trim()).filter(Boolean).slice(0, 100)
function occurred(value: number | string | undefined) {
  const date = new Date(value ?? NaN)
  if (!Number.isFinite(date.getTime())) throw new Error("Date fournisseur invalide ; message non acquitté")
  return date
}
const gmailLabelNames: Record<string, string> = { INBOX: "Réception", SENT: "Envoyés", TRASH: "Corbeille", SPAM: "Indésirables", DRAFT: "Brouillons", STARRED: "Suivi", IMPORTANT: "Important", UNREAD: "Non lu" }
export function parseGmailMessage(channel: ActiveChannel, message: GmailMessage, labelsById = new Map<string, string>()): ExternalMailMessage {
  const parts = gmailParts(message.payload)
  const text = (mime: string) => {
    const part = parts.find(part => !part.filename && part.mimeType?.toLowerCase() === mime && part.body?.data)
    return part?.body?.data ? Buffer.from(part.body.data, "base64url").toString("utf8").slice(0, 100_000) : null
  }
  const attachments: RemoteMailAttachment[] = parts.filter(part => part.filename || part.body?.attachmentId).map(part => ({
    id: part.body?.attachmentId || part.partId || "", name: remoteFileName(part.filename), type: (part.mimeType || "application/octet-stream").toLowerCase(),
    size: part.body?.size ?? 0, kind: part.body?.attachmentId ? "GMAIL_ATTACHMENT" : part.partId && part.body?.data ? "GMAIL_PART" : "UNSUPPORTED",
    inline: part.headers?.some(header => header.name.toLowerCase() === "content-disposition" && header.value.toLowerCase().startsWith("inline")) ?? false,
  }))
  // File names alone do not identify MIME parts safely. Keep unsupported entries
  // visible, but give them a stable index instead of a downloadable locator.
  attachments.forEach((file, index) => { if (!file.id) file.id = `unsupported-${index}` })
  const labels = message.labelIds || [], from = gmailHeader(message, "From")
  return { providerId: `${channel.id}:${message.id}`, direction: labels.includes("SENT") || address(from) === channel.emailAddress.toLowerCase() ? "OUTBOUND" : "INBOUND",
    internetMessageId: gmailHeader(message, "Message-ID") || null, inReplyTo: gmailHeader(message, "In-Reply-To") || null, from,
    to: addresses(gmailHeader(message, "To")), cc: addresses(gmailHeader(message, "Cc")), bcc: addresses(gmailHeader(message, "Bcc")),
    subject: gmailHeader(message, "Subject") || "Sans objet", bodyHtml: text("text/html"), bodyText: text("text/plain"), occurredAt: occurred(Number(message.internalDate)), unread: labels.includes("UNREAD"), draft: labels.includes("DRAFT"),
    observation: { presence: "PRESENT", read: !labels.includes("UNREAD"), folderIds: labels, folderNames: labels.filter(id => id !== "UNREAD").map(id => gmailLabelNames[id] || labelsById.get(id) || `Libellé ${id}`), checkedAt: new Date().toISOString(), attachments, attachmentsComplete: true } }
}
export type GraphMessage = { id: string; internetMessageId?: string; subject?: string; parentFolderId?: string; body?: { contentType?: string; content?: string }; bodyPreview?: string;
  from?: { emailAddress?: { name?: string; address?: string } }; toRecipients?: Array<{ emailAddress?: { name?: string; address?: string } }>;
  ccRecipients?: Array<{ emailAddress?: { name?: string; address?: string } }>; bccRecipients?: Array<{ emailAddress?: { name?: string; address?: string } }>;
  receivedDateTime?: string; sentDateTime?: string; isRead?: boolean; isDraft?: boolean; hasAttachments?: boolean }
const graphAddress = (entry?: { emailAddress?: { name?: string; address?: string } }) => entry?.emailAddress?.address || ""
export async function graphAttachmentMetadata(id: string, token: string, signal?: AbortSignal) {
  const files: RemoteMailAttachment[] = []
  const seen = new Set<string>()
  let next: string | null = `https://graph.microsoft.com/v1.0/me/messages/${mailResourceId(id)}/attachments?$select=id,name,contentType,size,isInline&$top=50`
  const prefix = new URL(next).pathname
  while (next) {
    const url = safeMicrosoftContinuation(next)
    if (new URL(url).pathname !== prefix || seen.has(url)) throw new Error("Curseur de pièces Microsoft invalide")
    seen.add(url)
    const payload: { value?: Array<{ id: string; name?: string; contentType?: string; size?: number; isInline?: boolean; "@odata.type"?: string }>; "@odata.nextLink"?: string } = await readMailJson(await providerFetch(url, { headers: mailHeaders(token), signal, cache: "no-store" }))
    for (const file of payload.value || []) files.push({ id: file.id, name: remoteFileName(file.name), type: (file.contentType || "application/octet-stream").toLowerCase(), size: file.size ?? 0,
      inline: !!file.isInline, kind: file["@odata.type"] === "#microsoft.graph.fileAttachment" ? "GRAPH_FILE" : "UNSUPPORTED" })
    if (files.length > 2000) throw new Error("Trop de pièces dans ce message ; métadonnées non acquittées")
    next = payload["@odata.nextLink"] || null
  }
  return files
}
export async function readRemoteMail(channel: ActiveChannel, id: string, token: string, options: { signal?: AbortSignal; folders?: Map<string, string>; sentFolderId?: string; sentHint?: boolean } = {}): Promise<ExternalMailMessage | null> {
  const { signal, folders = new Map<string, string>() } = options
  const encodedId = mailResourceId(id)
  const google = channel.provider === "GOOGLE"
  const url = google ? `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodedId}?format=full`
    : `https://graph.microsoft.com/v1.0/me/messages/${encodedId}?$select=id,internetMessageId,subject,body,bodyPreview,from,toRecipients,ccRecipients,bccRecipients,receivedDateTime,sentDateTime,isRead,isDraft,parentFolderId,hasAttachments`
  const response = await providerFetch(url, { headers: mailHeaders(token), signal, cache: "no-store" })
  if (response.status === 404) return null
  if (google) {
    const message = await readMailJson<GmailMessage>(response, 12 * 1024 * 1024)
    if (message.id !== id) throw new Error("Identité du message Gmail incohérente")
    if (message.labelIds?.some(label => !gmailLabelNames[label] && !folders.has(label)) && !folders.has("gmail-labels-loaded")) {
      const labels = await readMailJson<{ labels?: Array<{ id: string; name: string }> }>(await providerFetch("https://gmail.googleapis.com/gmail/v1/users/me/labels", { headers: mailHeaders(token), signal, cache: "no-store" }))
      for (const label of labels.labels || []) if (label.id && label.name) folders.set(label.id, label.name.slice(0, 200))
      folders.set("gmail-labels-loaded", "true")
    }
    return parseGmailMessage(channel, message, folders)
  }
  const message = await readMailJson<GraphMessage>(response)
  if (message.id !== id) throw new Error("Identité du message Microsoft incohérente")
  const from = graphAddress(message.from), outbound = options.sentHint || (!!options.sentFolderId && message.parentFolderId === options.sentFolderId) || address(from) === channel.emailAddress.toLowerCase()
  if (message.parentFolderId && !folders.has(message.parentFolderId)) {
    const folder = await readMailJson<{ id?: string; displayName?: string }>(await providerFetch(`https://graph.microsoft.com/v1.0/me/mailFolders/${mailResourceId(message.parentFolderId)}?$select=id,displayName`, { headers: mailHeaders(token), signal, cache: "no-store" }))
    if (folder.id !== message.parentFolderId || !folder.displayName) throw new Error("Emplacement Microsoft non vérifié")
    folders.set(message.parentFolderId, folder.displayName.slice(0, 200))
  }
  // Inline files may exist even when Graph's hasAttachments is false.
  const attachments = await graphAttachmentMetadata(id, token, signal)
  return { providerId: `${channel.id}:${id}`, direction: outbound ? "OUTBOUND" : "INBOUND", internetMessageId: message.internetMessageId || null, inReplyTo: null,
    from, to: (message.toRecipients || []).map(graphAddress).filter(Boolean), cc: (message.ccRecipients || []).map(graphAddress).filter(Boolean), bcc: (message.bccRecipients || []).map(graphAddress).filter(Boolean),
    subject: message.subject || "Sans objet", bodyHtml: message.body?.contentType?.toLowerCase() === "html" ? message.body.content?.slice(0, 100_000) || null : null,
    bodyText: (message.body?.contentType?.toLowerCase() === "text" ? message.body.content : message.bodyPreview)?.slice(0, 100_000) || null,
    occurredAt: occurred((outbound ? message.sentDateTime : message.receivedDateTime) || message.sentDateTime), unread: message.isRead === false, draft: !!message.isDraft,
    observation: { presence: "PRESENT", read: typeof message.isRead === "boolean" ? message.isRead : null, folderIds: message.parentFolderId ? [message.parentFolderId] : [], folderNames: message.parentFolderId ? [folders.get(message.parentFolderId)!] : [],
      checkedAt: new Date().toISOString(), attachments, attachmentsComplete: true } }
}
