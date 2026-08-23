import { restoreBackupPayload } from "@/lib/backup"
import { getRouteAuth } from "@/lib/route-auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const MAX_BACKUP_BYTES = 100 * 1024 * 1024

export async function POST(request: Request) {
  const access = await getRouteAuth("company.manage")
  if (!access.ok) return access.response
  const { userId, companyId } = access.context

  const contentLength = Number(request.headers.get("content-length") ?? 0)
  if (contentLength > MAX_BACKUP_BYTES) {
    return Response.json({ error: "La sauvegarde dépasse 100 Mo" }, { status: 413 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get("backup")
    if (!(file instanceof File)) {
      return Response.json({ error: "Fichier de sauvegarde requis" }, { status: 400 })
    }
    if (file.size > MAX_BACKUP_BYTES) {
      return Response.json({ error: "La sauvegarde dépasse 100 Mo" }, { status: 413 })
    }
    const payload = JSON.parse(await file.text())
    const result = await restoreBackupPayload(payload, userId, companyId)
    return Response.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Restauration impossible"
    return Response.json({ error: message }, { status: 400 })
  }
}
