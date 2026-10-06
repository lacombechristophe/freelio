import "server-only"
import { z } from "zod"
import { activeCommunicationChannel, readOAuthCredentials } from "./email-provider"
import { readResendCredentials } from "./provider-credentials"
import { mailScopeGranted } from "./capabilities"
import { validInternetMessageId } from "./reply-context"
import { providerFetch } from "@/lib/integrations/provider-fetch"
import { assertDemoMutationAllowed } from "@/lib/demo-policy"

export type RecoveryObservation = { outcome: "ACCEPTED"; providerId: string; providerMessageId: string | null } | { outcome: "UNKNOWN" | "DRAFT" | "UNAVAILABLE" }
type FrozenProviderReference = { companyId: string; channelId: string; provider: string; providerId: string | null; providerDraftId: string | null; providerMessageId: string | null; from: string; to: string }
const address = (value: string) => (value.match(/<([^<>]+)>$/)?.[1] || value).trim().toLowerCase()
const remoteId = z.string().min(1).max(2048).refine(value => !/[\r\n]/.test(value))

/** Deliberately GET-only: even OAuth refresh is excluded from reconciliation. */
export async function inspectManualEmailProvider(input: FrozenProviderReference, signal?: AbortSignal): Promise<RecoveryObservation> {
  assertDemoMutationAllowed()
  try {
    const channel = await activeCommunicationChannel(input.companyId, input.channelId)
    if (channel.provider !== input.provider || channel.mailEnabled === false || address(input.from) !== channel.emailAddress.toLowerCase()) return { outcome: "UNAVAILABLE" }
    const get = async (url: string, headers: Record<string, string>) => {
      const response = await providerFetch(url, { method: "GET", headers, signal }, 15_000)
      if (!response.ok) throw new Error("RECOVERY_READ_UNAVAILABLE")
      return response.json() as Promise<unknown>
    }
    if (input.provider === "RESEND") {
      if (!input.providerId) return { outcome: "UNKNOWN" }
      const apiKey = channel.id === "platform" ? process.env.RESEND_API_KEY?.trim() : readResendCredentials(channel.credentialsEncrypted)?.apiKey
      if (!apiKey) return { outcome: "UNAVAILABLE" }
      const data = z.object({ id: remoteId, from: z.string(), to: z.array(z.string()) }).safeParse(await get(`https://api.resend.com/emails/${encodeURIComponent(input.providerId)}`, { authorization: `Bearer ${apiKey}` }))
      if (!data.success || data.data.id !== input.providerId || address(data.data.from) !== address(input.from) || !data.data.to.some(value => address(value) === address(input.to))) return { outcome: "UNKNOWN" }
      return { outcome: "ACCEPTED", providerId: input.providerId, providerMessageId: input.providerMessageId }
    }
    const credentials = readOAuthCredentials(channel)
    if (new Date(credentials.expiresAt).getTime() <= Date.now() || !mailScopeGranted(input.provider, credentials.scope, "READ")) return { outcome: "UNAVAILABLE" }
    const headers = { authorization: `Bearer ${credentials.accessToken}`, Prefer: 'IdType="ImmutableId"' }
    if (!validInternetMessageId(input.providerMessageId)) return { outcome: "UNKNOWN" }
    if (input.provider === "GOOGLE") {
      const query = new URLSearchParams({ q: `rfc822msgid:${input.providerMessageId}`, labelIds: "SENT", maxResults: "2" })
      const listed = z.object({ messages: z.array(z.object({ id: remoteId })).default([]), nextPageToken: z.string().optional() }).safeParse(await get(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${query}`, headers))
      if (!listed.success || listed.data.messages.length !== 1 || listed.data.nextPageToken) return { outcome: "UNKNOWN" }
      const id = listed.data.messages[0].id
      const metadata = new URLSearchParams({ format: "metadata" }); metadata.append("metadataHeaders", "Message-ID"); metadata.append("metadataHeaders", "From")
      const message = z.object({ id: remoteId, labelIds: z.array(z.string()), payload: z.object({ headers: z.array(z.object({ name: z.string(), value: z.string() })) }) }).safeParse(await get(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?${metadata}`, headers))
      if (!message.success || message.data.id !== id || !message.data.labelIds.includes("SENT") || message.data.labelIds.includes("DRAFT")) return { outcome: "UNKNOWN" }
      const header = (name: string) => message.data.payload.headers.filter(value => value.name.toLowerCase() === name)
      const messageIds = header("message-id"), senders = header("from")
      if (messageIds.length !== 1 || messageIds[0].value !== input.providerMessageId || senders.length !== 1 || address(senders[0].value) !== address(input.from)) return { outcome: "UNKNOWN" }
      return { outcome: "ACCEPTED", providerId: `${channel.id}:${id}`, providerMessageId: input.providerMessageId }
    }
    if (input.provider === "MICROSOFT") {
      const select = "id,isDraft,internetMessageId,from,sentDateTime"
      const messageSchema = z.object({ id: remoteId, isDraft: z.boolean(), internetMessageId: z.string(), from: z.object({ emailAddress: z.object({ address: z.string() }) }), sentDateTime: z.string().optional() })
      let data: unknown
      if (input.providerDraftId) {
        data = await get(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(input.providerDraftId)}?$select=${select}`, headers)
      } else {
        const query = new URLSearchParams({ "$filter": `internetMessageId eq '${input.providerMessageId.replaceAll("'", "''")}'`, "$select": select, "$top": "2" })
        const listed = z.object({ value: z.array(messageSchema), "@odata.nextLink": z.string().optional() }).safeParse(await get(`https://graph.microsoft.com/v1.0/me/mailFolders/sentitems/messages?${query}`, headers))
        if (!listed.success || listed.data.value.length !== 1 || listed.data["@odata.nextLink"]) return { outcome: "UNKNOWN" }
        data = listed.data.value[0]
      }
      const message = messageSchema.safeParse(data)
      if (!message.success || (input.providerDraftId && message.data.id !== input.providerDraftId) || message.data.internetMessageId !== input.providerMessageId || address(message.data.from.emailAddress.address) !== address(input.from)) return { outcome: "UNKNOWN" }
      if (message.data.isDraft) return { outcome: "DRAFT" }
      if (!message.data.sentDateTime || !Number.isFinite(Date.parse(message.data.sentDateTime))) return { outcome: "UNKNOWN" }
      return { outcome: "ACCEPTED", providerId: `${channel.id}:${message.data.id}`, providerMessageId: input.providerMessageId }
    }
    return { outcome: "UNAVAILABLE" }
  } catch {
    // Never store raw provider responses/errors, which can contain hidden copies.
    return { outcome: "UNAVAILABLE" }
  }
}
