import prisma from "@/lib/prisma"
import { hasPermission, type CompanyRole } from "@/lib/permissions"
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

async function canAccessFieldExpense(
  id: string,
  companyId: string,
  membershipId: string,
  role: CompanyRole,
  mode: "read" | "write",
  idKind: "expense" | "file" = "expense"
) {
  const permission = mode === "write" ? "operations.write" : "operations.read"
  if (!hasPermission(role, permission)) return false
  return Boolean(await prisma.expense.findFirst({
    where: {
      ...(idKind === "expense" ? { id } : { files: { some: { id } } }),
      companyId,
      interventionId: { not: null },
      intervention: role === "TECHNICIAN" ? { assignedMembershipId: membershipId } : {},
    },
    select: { id: true },
  }))
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
  const { companyId, membershipId, role } = access.context

  const { kind: rawKind, id } = await params
  const kind = parseKind(rawKind)
  if (!kind) return Response.json({ error: "Type invalide" }, { status: 400 })
  const writePermission = kind === "expense" ? "finance.write" : kind === "project" || kind === "intervention" ? "operations.write" : "crm.write"
  const fieldExpenseAccess = kind === "expense" && !hasPermission(role, writePermission) ? await canAccessFieldExpense(id, companyId, membershipId, role, "write") : false
  if (!hasPermission(role, writePermission) && !fieldExpenseAccess) {
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

  let stored: Awaited<ReturnType<typeof storeLocalFile>> | null = null
  try {
    const saved = await storeLocalFile({ companyId, kind, resourceId: id, file })
    stored = saved
    if (kind === "expense") {
      const existing = await prisma.expenseFile.findFirst({ where: { expenseId: id, sha256: saved.sha256 } })
      if (existing) {
        await removeLocalFile(saved.relativePath)
        await prisma.expense.update({ where: { id }, data: { status: "JUSTIFIED" } })
        return Response.json(existing)
      }
      const record = await prisma.$transaction(async (tx) => {
        const created = await tx.expenseFile.create({
          data: {
            expenseId: id,
            url: saved.relativePath,
            name: saved.originalName,
            size: saved.size,
            type: saved.type,
            sha256: saved.sha256,
          },
        })
        await tx.expense.update({ where: { id }, data: { status: "JUSTIFIED" } })
        return created
      })
      return Response.json(record, { status: 201 })
    }
    if (kind === "project") {
      const record = await prisma.projectFile.create({
        data: {
          projectId: id,
          url: saved.relativePath,
          name: saved.originalName,
          size: saved.size,
          type: saved.type,
          sha256: saved.sha256,
        },
      })
      return Response.json(record, { status: 201 })
    }
    if (kind === "intervention") {
      const existing = await prisma.interventionFile.findFirst({
        where: { interventionId: id, sha256: saved.sha256 },
      })
      if (existing) {
        await removeLocalFile(saved.relativePath)
        return Response.json(existing)
      }
      const record = await prisma.interventionFile.create({
        data: {
          interventionId: id,
          url: saved.relativePath,
          name: saved.originalName,
          size: saved.size,
          mimeType: saved.type,
          sha256: saved.sha256,
          kind: saved.type.startsWith("image/") ? "PHOTO" : "DOCUMENT",
        },
      })
      return Response.json(record, { status: 201 })
    }
    const record = await prisma.clientFile.create({
      data: {
        clientId: id,
        url: saved.relativePath,
        name: saved.originalName,
        size: saved.size,
        type: saved.type,
        sha256: saved.sha256,
      },
    })
    return Response.json(record, { status: 201 })
  } catch (error) {
    if (stored) await removeLocalFile(stored.relativePath).catch(() => {})
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
  const { companyId, membershipId, role } = access.context

  const { kind: rawKind, id } = await params
  const kind = parseKind(rawKind)
  if (!kind) return Response.json({ error: "Type invalide" }, { status: 400 })
  const readPermission = kind === "expense" ? "finance.read" : kind === "project" || kind === "intervention" ? "operations.read" : "crm.read"
  const fieldExpenseAccess = kind === "expense" && !hasPermission(role, readPermission) ? await canAccessFieldExpense(id, companyId, membershipId, role, "read", "file") : false
  if (!hasPermission(role, readPermission) && !fieldExpenseAccess) return Response.json({ error: "Accès refusé" }, { status: 403 })
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
  const { companyId, membershipId, role } = access.context

  const { kind: rawKind, id } = await params
  const kind = parseKind(rawKind)
  if (!kind) return Response.json({ error: "Type invalide" }, { status: 400 })
  const writePermission = kind === "expense" ? "finance.write" : kind === "project" || kind === "intervention" ? "operations.write" : "crm.write"
  const fieldExpenseAccess = kind === "expense" && !hasPermission(role, writePermission) ? await canAccessFieldExpense(id, companyId, membershipId, role, "write", "file") : false
  if (!hasPermission(role, writePermission) && !fieldExpenseAccess) return Response.json({ error: "Accès refusé" }, { status: 403 })
  const file = await findFile(kind, id, companyId)
  if (!file) return Response.json({ error: "Fichier introuvable" }, { status: 404 })

  if (kind === "expense") {
    await prisma.$transaction(async (tx) => {
      const deleted = await tx.expenseFile.delete({ where: { id }, select: { expenseId: true } })
      const remaining = await tx.expenseFile.count({ where: { expenseId: deleted.expenseId } })
      if (!remaining) await tx.expense.update({ where: { id: deleted.expenseId }, data: { status: "TO_JUSTIFY" } })
    })
  }
  else if (kind === "project") await prisma.projectFile.delete({ where: { id } })
  else if (kind === "intervention") await prisma.interventionFile.delete({ where: { id } })
  else await prisma.clientFile.delete({ where: { id } })
  await removeLocalFile(file.url)

  return Response.json({ ok: true })
}
