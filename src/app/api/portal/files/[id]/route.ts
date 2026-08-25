import prisma from "@/lib/prisma"
import { readLocalFile } from "@/lib/local-files"
import { getCurrentPortalAccess } from "@/lib/portal/session"

export const runtime = "nodejs"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getCurrentPortalAccess()
  if (!access) return Response.json({ error: "Accès expiré ou révoqué" }, { status: 401 })
  const { id } = await params
  const file = await prisma.clientFile.findFirst({
    where: { id, clientId: access.clientId, client: { companyId: access.companyId } },
    select: { url: true, name: true, type: true, size: true },
  })
  if (!file) return Response.json({ error: "Document introuvable" }, { status: 404 })

  try {
    const bytes = await readLocalFile(file.url)
    return new Response(bytes, {
      headers: {
        "content-type": file.type,
        "content-length": String(bytes.length),
        "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        "content-security-policy": "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'",
      },
    })
  } catch {
    return Response.json({ error: "Le document archivé est manquant" }, { status: 410 })
  }
}
