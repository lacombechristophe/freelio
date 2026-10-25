import { createHash } from "node:crypto"
import { z } from "zod"
import { withRouteAuth } from "@/lib/route-auth"
import { assertDemoMutationAllowed, DEMO_READ_ONLY_MESSAGE } from "@/lib/demo-policy"
import { PayloadTooLargeError, readBodyBytes, readJsonBody } from "@/lib/http-body"
import { abortDirectFileUpload, confirmDirectFileUpload, createDirectFileUpload, directFileUploadAvailable, hasExpectedSignature, storeFileBytes } from "@/lib/local-files"
import { emailAttachmentMetadataSchema, emailAttachmentsSchema, MAX_EMAIL_FILE_BYTES } from "@/lib/communications/attachment-types"
import { readEmailAttachmentBytes } from "@/lib/communications/attachment-content"
import { addEmailDraftAttachment, assertEditableDraft, EmailAttachmentError, removeEmailDraftAttachment } from "@/lib/communications/draft-attachments"
import { EmailDraftConflict, readEmailDraft } from "@/lib/communications/drafts"

export const runtime = "nodejs"
type Params = { params: Promise<{ id: string }> }
const identity = z.object({ version: z.number().int().positive() })
const directInput = identity.extend({ action: z.enum(["presign", "complete", "abort"]), file: emailAttachmentMetadataSchema, storageKey: z.string().max(1000).optional() })

function errorResponse(error: unknown) {
  if (error instanceof Error && error.message === DEMO_READ_ONLY_MESSAGE) return Response.json({ error: error.message }, { status: 403 })
  if (error instanceof PayloadTooLargeError) return Response.json({ error: "Le transfert dépasse 5 Mo" }, { status: 413 })
  if (error instanceof EmailDraftConflict) return Response.json({ error: error.message }, { status: 409 })
  if (error instanceof z.ZodError) return Response.json({ error: "Pièce invalide : PDF, PNG ou JPEG, 5 Mo maximum" }, { status: 400 })
  if (error instanceof EmailAttachmentError) return Response.json({ error: error.message }, { status: 400 })
  if (error instanceof Error && error.message === "Brouillon introuvable") return Response.json({ error: "Brouillon introuvable" }, { status: 404 })
  return Response.json({ error: "Opération sur les pièces jointes impossible ; rouvrez le brouillon" }, { status: 500 })
}

function crossOrigin(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return true
  const origin = request.headers.get("origin")
  if (!origin) return false
  // Next/proxies may expose an internal request URL; never trust forwarded
  // headers to extend the set of origins allowed to mutate private drafts.
  const configured = process.env.PUBLIC_APP_URL?.trim() || process.env.AUTH_URL?.trim()
  try { return origin !== new URL(configured || request.url).origin } catch { return true }
}

export async function POST(request: Request, { params }: Params) {
  return withRouteAuth("automation.write", async ({ companyId, userId }) => {
    if (crossOrigin(request)) return Response.json({ error: "Origine refusée" }, { status: 403 })
    try {
      assertDemoMutationAllowed()
      const id = z.string().cuid().parse((await params).id)
      await readEmailDraft(companyId, userId, id)
      const contentType = request.headers.get("content-type") || ""
      if (contentType.includes("application/json")) {
        const data = directInput.parse(await readJsonBody(request, 64 * 1024))
        const storage = { companyId, kind: "email-draft" as const, resourceId: id, originalName: data.file.name, ...data.file }
        if (data.action === "presign") {
          const draft = await assertEditableDraft(companyId, userId, id, data.version)
          emailAttachmentsSchema.parse([...emailAttachmentsSchema.parse(draft.attachments), { ...data.file, relativePath: "pending" }])
          return Response.json(directFileUploadAvailable() ? { direct: true, upload: await createDirectFileUpload(storage) } : { direct: false })
        }
        if (!data.storageKey) throw new EmailAttachmentError("Clé de transfert manquante")
        if (data.action === "abort") {
          await abortDirectFileUpload({ ...storage, storageKey: data.storageKey })
          return Response.json({ success: true })
        }
        const draft = await addEmailDraftAttachment(companyId, userId, id, data.version, data.file, () => confirmDirectFileUpload({ ...storage, storageKey: data.storageKey! }))
        return Response.json({ draft })
      }
      if (!contentType.startsWith("multipart/form-data")) return Response.json({ error: "Format de transfert invalide" }, { status: 415 })
      const body = await readBodyBytes(request, MAX_EMAIL_FILE_BYTES + 64 * 1024)
      const form = await new Response(body, { headers: { "content-type": contentType } }).formData()
      const file = form.get("file")
      if (!(file instanceof File)) throw new EmailAttachmentError("Fichier manquant")
      const version = identity.parse({ version: Number(form.get("version")) }).version
      if (file.size > MAX_EMAIL_FILE_BYTES) throw new PayloadTooLargeError()
      const bytes = Buffer.from(await file.arrayBuffer())
      const metadata = emailAttachmentMetadataSchema.parse({ id: form.get("uploadId"), name: file.name, type: file.type, size: file.size, sha256: createHash("sha256").update(bytes).digest("hex") })
      if (!hasExpectedSignature(metadata.type, bytes)) throw new EmailAttachmentError("Le contenu du fichier ne correspond pas à son type")
      const draft = await addEmailDraftAttachment(companyId, userId, id, version, metadata, () => storeFileBytes({ companyId, kind: "email-draft", resourceId: id, originalName: metadata.name, type: metadata.type, bytes }))
      return Response.json({ draft })
    } catch (error) { return errorResponse(error) }
  })
}

export async function GET(request: Request, { params }: Params) {
  return withRouteAuth("automation.read", async ({ companyId, userId }) => {
    try {
      const draft = await readEmailDraft(companyId, userId, (await params).id)
      const attachmentId = z.string().uuid().parse(new URL(request.url).searchParams.get("attachmentId"))
      const file = emailAttachmentsSchema.parse(draft.attachments).find(item => item.id === attachmentId)
      if (!file) return Response.json({ error: "Pièce jointe introuvable" }, { status: 404 })
      const { bytes } = await readEmailAttachmentBytes(companyId, file)
      const filename = encodeURIComponent(file.name).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16)}`)
      return new Response(new Uint8Array(bytes), { headers: { "content-type": file.type, "content-disposition": `attachment; filename="document"; filename*=UTF-8''${filename}`, "content-length": String(bytes.length), "content-security-policy": "default-src 'none'; sandbox" } })
    } catch (error) { return errorResponse(error) }
  })
}

export async function DELETE(request: Request, { params }: Params) {
  return withRouteAuth("automation.write", async ({ companyId, userId }) => {
    if (crossOrigin(request)) return Response.json({ error: "Origine refusée" }, { status: 403 })
    try {
      assertDemoMutationAllowed()
      const id = z.string().cuid().parse((await params).id)
      const data = identity.extend({ attachmentId: z.string().uuid() }).parse(await readJsonBody(request, 4096))
      return Response.json({ draft: await removeEmailDraftAttachment(companyId, userId, id, data.version, data.attachmentId) })
    } catch (error) { return errorResponse(error) }
  })
}
