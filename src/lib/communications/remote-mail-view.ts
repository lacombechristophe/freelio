import "server-only"
import { createHash } from "node:crypto"
import { remoteAttachmentRefusal, remoteMailObservationSchema, type RemoteMailAttachment } from "./remote-mail-types"

export function remoteAttachmentKey(file: RemoteMailAttachment) {
  return createHash("sha256").update(JSON.stringify([file.kind, file.id, file.name, file.type, file.size, file.inline])).digest("hex")
}
export function remoteMailView(value: unknown) {
  const result = remoteMailObservationSchema.safeParse(value)
  if (!result.success) return null
  const { attachments, ...state } = result.data
  return { ...state, attachments: attachments.map(file => ({ key: remoteAttachmentKey(file), name: file.name, type: file.type, size: file.size, inline: file.inline, refusal: remoteAttachmentRefusal(file) })) }
}
