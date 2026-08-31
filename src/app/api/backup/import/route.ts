import { restoreBackupPayload } from "@/lib/backup"
import { PayloadTooLargeError, readBodyBytes } from "@/lib/http-body"
import { withRouteAuth } from "@/lib/route-auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const MAX_HTTP_RESTORE_BYTES = 4 * 1024 * 1024

export async function POST(request: Request) {
  return withRouteAuth("company.manage", async ({ userId, companyId }) => {
    if (process.env.ENABLE_IN_APP_RESTORE !== "true") {
      return Response.json(
        { error: "La restauration web est désactivée. Utilisez la procédure isolée du runbook." },
        { status: 403 },
      )
    }

    try {
      const contentType = request.headers.get("content-type") || ""
      const boundedRequest = new Request(request.url, {
        method: "POST",
        headers: { "content-type": contentType },
        body: Buffer.from(await readBodyBytes(request, MAX_HTTP_RESTORE_BYTES)),
      })
      const formData = await boundedRequest.formData()
      const file = formData.get("backup")
      if (!(file instanceof File)) {
        return Response.json({ error: "Fichier de sauvegarde requis" }, { status: 400 })
      }
      const payload = JSON.parse(await file.text())
      const result = await restoreBackupPayload(payload, userId, companyId)
      return Response.json(result)
    } catch (error) {
      if (error instanceof PayloadTooLargeError) {
        return Response.json({ error: "La restauration web est limitée à 4 Mo. Utilisez la procédure isolée pour une archive plus grande." }, { status: 413 })
      }
      const message = error instanceof Error ? error.message : "Restauration impossible"
      return Response.json({ error: message }, { status: 400 })
    }
  })
}
