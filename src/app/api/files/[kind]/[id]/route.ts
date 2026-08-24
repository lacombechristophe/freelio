import prisma from "@/lib/prisma"
import { hasPermission } from "@/lib/permissions"
import { getRouteAuth } from "@/lib/route-auth"
import {
  readLocalFile,
  removeLocalFile,
  storeLocalFile,
  type LocalFileKind,
} from "@/lib/local-files"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const KINDS = new Set<LocalFileKind>(["client", "expense", "project", "intervention"])

function parseKind(value: string): LocalFileKind | null {
  return KINDS.has(value as LocalFileKind) ? (value as LocalFileKind) : null
}

async function resourceExists(kind: LocalFileKind, id: string, companyId: string) {
  if (kind === "expense") {
    return Boolean(await prisma.expense.findFirst({ where: { id, companyId }, select: { id: true } }))
  }
  if (kind === "project") {
    return Boolean(await prisma.project.findFirst({ where: { id, companyId }, select: { id: true } }))
  }
  if (kind === "intervention") {
    return Boolean(await prisma.fieldIntervention.findFirst({ where: { id, companyId }, select: { id: true } }))
  }
  return Boolean(await prisma.client.findFirst({ where: { id, companyId }, select: { id: true } }))
}

async function findFile(kind: LocalFileKind, id: string, companyId: string) {
  if (kind === "expense") {
    return prisma.expenseFile.findFirst({
      where: { id, expense: { companyId } },
      select: { id: true, url: true, name: true, size: true, type: true },
    })
  }
  if (kind === "project") {
    return prisma.projectFile.findFirst({
      where: { id, project: { companyId } },
      select: { id: true, url: true, name: true, size: true, type: true },
    })
  }
  if (kind === "intervention") {
    const file = await prisma.interventionFile.findFirst({
      where: { id, intervention: { companyId } },
      select: { id: true, url: true, name: true, size: true, mimeType: true },
    })
    return file ? { ...file, type: file.mimeType || "application/octet-stream" } : null
  }
  return prisma.clientFile.findFirst({
    where: { id, client: { companyId } },
    select: { id: true, url: true, name: true, size: true, type: true },
  })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ kind: string; id: string }> }
) {
  const access = await getRouteAuth()
  if (!access.ok) return access.response
  const { companyId, role } = access.context

  const { kind: rawKind, id } = await params
  const kind = parseKind(rawKind)
  const writePermission = kind === "expense" ? "finance.write" : kind === "project" || kind === "intervention" ? "operations.write" : "crm.write"
  if (!kind || !hasPermission(role, writePermission)) {
    return Response.json({ error: "Accès refusé" }, { status: 403 })
  }
  if (!(await resourceExists(kind, id, companyId))) {
    return Response.json({ error: "Ressource introuvable" }, { status: 404 })
  }

  const formData = await request.formData()
  const file = formData.get("file")
  if (!(file instanceof File)) {
    return Response.json({ error: "Fichier requis" }, { status: 400 })
  }

  try {
    const stored = await storeLocalFile({ companyId, kind, resourceId: id, file })
    if (kind === "expense") {
      const record = await prisma.expenseFile.create({
        data: {
          expenseId: id,
          url: stored.relativePath,
          name: stored.originalName,
          size: stored.size,
          type: stored.type,
          sha256: stored.sha256,
        },
      })
      return Response.json(record, { status: 201 })
    }
    if (kind === "project") {
      const record = await prisma.projectFile.create({
        data: {
          projectId: id,
          url: stored.relativePath,
          name: stored.originalName,
          size: stored.size,
          type: stored.type,
          sha256: stored.sha256,
        },
      })
      return Response.json(record, { status: 201 })
    }
    if (kind === "intervention") {
      const existing = await prisma.interventionFile.findFirst({
        where: { interventionId: id, sha256: stored.sha256 },
      })
      if (existing) {
        await removeLocalFile(stored.relativePath)
        return Response.json(existing)
      }
      const record = await prisma.interventionFile.create({
        data: {
          interventionId: id,
          url: stored.relativePath,
          name: stored.originalName,
          size: stored.size,
          mimeType: stored.type,
          sha256: stored.sha256,
          kind: stored.type.startsWith("image/") ? "PHOTO" : "DOCUMENT",
        },
      })
      return Response.json(record, { status: 201 })
    }
    const record = await prisma.clientFile.create({
      data: {
        clientId: id,
        url: stored.relativePath,
        name: stored.originalName,
        size: stored.size,
        type: stored.type,
        sha256: stored.sha256,
      },
    })
    return Response.json(record, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Échec de l'enregistrement"
    return Response.json({ error: message }, { status: 400 })
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ kind: string; id: string }> }
) {
  const access = await getRouteAuth()
  if (!access.ok) return access.response
  const { companyId, role } = access.context

  const { kind: rawKind, id } = await params
  const kind = parseKind(rawKind)
  if (!kind) return Response.json({ error: "Type invalide" }, { status: 400 })
  const readPermission = kind === "expense" ? "finance.read" : kind === "project" || kind === "intervention" ? "operations.read" : "crm.read"
  if (!hasPermission(role, readPermission)) return Response.json({ error: "Accès refusé" }, { status: 403 })
  const file = await findFile(kind, id, companyId)
  if (!file) return Response.json({ error: "Fichier introuvable" }, { status: 404 })

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
    return Response.json({ error: "Le fichier local est manquant" }, { status: 410 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ kind: string; id: string }> }
) {
  const access = await getRouteAuth()
  if (!access.ok) return access.response
  const { companyId, role } = access.context

  const { kind: rawKind, id } = await params
  const kind = parseKind(rawKind)
  if (!kind) return Response.json({ error: "Type invalide" }, { status: 400 })
  const writePermission = kind === "expense" ? "finance.write" : kind === "project" || kind === "intervention" ? "operations.write" : "crm.write"
  if (!hasPermission(role, writePermission)) return Response.json({ error: "Accès refusé" }, { status: 403 })
  const file = await findFile(kind, id, companyId)
  if (!file) return Response.json({ error: "Fichier introuvable" }, { status: 404 })

  if (kind === "expense") await prisma.expenseFile.delete({ where: { id } })
  else if (kind === "project") await prisma.projectFile.delete({ where: { id } })
  else if (kind === "intervention") await prisma.interventionFile.delete({ where: { id } })
  else await prisma.clientFile.delete({ where: { id } })
  await removeLocalFile(file.url)

  return Response.json({ ok: true })
}
