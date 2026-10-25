import { z } from "zod"
import { withRouteAuth } from "@/lib/route-auth"
import { isPublicReadOnlyDemo } from "@/lib/demo-policy"
import { apiRateLimit } from "@/lib/rate-limit"
import { PayloadTooLargeError } from "@/lib/http-body"
import { IncomingAttachmentError, readIncomingAttachment } from "@/lib/communications/incoming-attachment"
import { MailReadError } from "@/lib/communications/oauth-mail-reader"
import prisma from "@/lib/prisma"

export const runtime = "nodejs"
export async function GET(_request: Request, { params }: { params: Promise<{ messageId: string; key: string }> }) {
  return withRouteAuth("automation.read", async ({ companyId, userId }) => {
    if (isPublicReadOnlyDemo()) return Response.json({ error: "La lecture des pièces chez un fournisseur est désactivée dans cette démonstration" }, { status: 403 })
    const parsed = z.object({ messageId: z.string().cuid(), key: z.string().regex(/^[a-f0-9]{64}$/) }).safeParse(await params)
    if (!parsed.success) return Response.json({ error: "Pièce jointe introuvable" }, { status: 404 })
    if (!(await apiRateLimit.limit(`incoming-attachment:${companyId}:${userId}`)).success) return Response.json({ error: "Trop de lectures de pièces jointes ; réessayez plus tard" }, { status: 429 })
    try {
      const file = await readIncomingAttachment(companyId, parsed.data.messageId, parsed.data.key)
      const name = encodeURIComponent(file.name).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
      return withRouteAuth("automation.read", async current => {
        if (current.companyId !== companyId || current.userId !== userId ||
          !await prisma.emailMessage.count({ where: { id: parsed.data.messageId, companyId, thread: { companyId, channelId: file.channelId, channel: { companyId, status: "ACTIVE", mailEnabled: true } } } })) {
          return Response.json({ error: "Pièce jointe introuvable" }, { status: 404 })
        }
        return new Response(new Uint8Array(file.bytes), { headers: { "content-type": file.type, "content-length": String(file.bytes.length),
          "content-disposition": `attachment; filename*=UTF-8''${name}`, "content-security-policy": "default-src 'none'; sandbox" } })
      })
    } catch (error) {
      if (error instanceof IncomingAttachmentError) return Response.json({ error: error.message }, { status: error.status })
      if (error instanceof PayloadTooLargeError) return Response.json({ error: "Pièce trop volumineuse ; 5 Mo maximum" }, { status: 413 })
      if (error instanceof MailReadError) return Response.json({ error: error.status === 404 ? "La pièce n’est plus disponible chez le fournisseur" : "Lecture fournisseur indisponible ; réessayez après synchronisation" }, { status: error.status === 404 ? 410 : 502 })
      return Response.json({ error: "Pièce indisponible ; vérifiez la connexion de la messagerie" }, { status: 502 })
    }
  })
}
