import { z } from "zod"

import prisma from "@/lib/prisma"
import { requestContext } from "@/lib/context"
import { hasPermission, type CompanyRole, type Permission } from "@/lib/permissions"
import { withRouteAuth } from "@/lib/route-auth"
import { PayloadTooLargeError, readBodyBytes, readJsonBody } from "@/lib/http-body"
import {
  MAX_LOCAL_FILE_BYTES,
  abortDirectFileUpload,
  confirmDirectFileUpload,
  createDirectFileUpload,
  directFileUploadAvailable,
  readLocalFile,
  removeLocalFile,
  storeLocalFile,
  type LocalFileKind,
  type StoredLocalFile,
} from "@/lib/local-files"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const KINDS = new Set<LocalFileKind>(["client", "expense", "project", "intervention"])
const MAX_LEGACY_BODY_BYTES = 4 * 1024 * 1024
const directFileSchema = z.object({
  name: z.string().trim().min(1).max(180),
  size: z.number().int().positive().max(MAX_LOCAL_FILE_BYTES),
  type: z.string().trim().min(1).max(120),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i),
})
const directRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("presign"), file: directFileSchema }),
  z.object({ action: z.literal("complete"), file: directFileSchema.extend({ storageKey: z.string().trim().min(10).max(1_000) }) }),
  z.object({ action: z.literal("abort"), storageKey: z.string().trim().min(10).max(1_000) }),
])

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

async function canAccessFieldExpense(id: string, companyId: string, membershipId: string, role: CompanyRole, mode: "read" | "write", idKind: "expense" | "file" = "expense") {
  const permission = mode === "write" ? "operations.write" : "operations.read"
  if (!hasPermission(role, permission)) return false
  return Boolean(
    await prisma.expense.findFirst({
      where: {
        ...(idKind === "expense" ? { id } : { files: { some: { id } } }),
        companyId,
        interventionId: { not: null },
        intervention: role === "TECHNICIAN" ? { assignedMembershipId: membershipId } : {},
      },
      select: { id: true },
    }),
  )
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

async function persistFile(kind: LocalFileKind, resourceId: string, saved: StoredLocalFile) {
  if (kind === "expense") {
    const existing = await prisma.expenseFile.findFirst({ where: { expenseId: resourceId, sha256: saved.sha256 } })
    if (existing) {
      await removeLocalFile(saved.relativePath)
      await prisma.expense.update({ where: { id: resourceId }, data: { status: "JUSTIFIED" } })
      return existing
    }
    return prisma.$transaction(async (tx) => {
      const created = await tx.expenseFile.create({
        data: {
          expenseId: resourceId,
          url: saved.relativePath,
          name: saved.originalName,
          size: saved.size,
          type: saved.type,
          sha256: saved.sha256,
        },
      })
      await tx.expense.update({ where: { id: resourceId }, data: { status: "JUSTIFIED" } })
      return created
    })
  }
  if (kind === "project") {
    const existing = await prisma.projectFile.findFirst({ where: { projectId: resourceId, sha256: saved.sha256 } })
    if (existing) {
      await removeLocalFile(saved.relativePath)
      return existing
    }
    return prisma.projectFile.create({
      data: {
        projectId: resourceId,
        url: saved.relativePath,
        name: saved.originalName,
        size: saved.size,
        type: saved.type,
        sha256: saved.sha256,
      },
    })
  }
  if (kind === "intervention") {
    const existing = await prisma.interventionFile.findFirst({ where: { interventionId: resourceId, sha256: saved.sha256 } })
    if (existing) {
      await removeLocalFile(saved.relativePath)
      return existing
    }
    return prisma.interventionFile.create({
      data: {
        interventionId: resourceId,
        url: saved.relativePath,
        name: saved.originalName,
        size: saved.size,
        mimeType: saved.type,
        sha256: saved.sha256,
        kind: saved.type.startsWith("image/") ? "PHOTO" : "DOCUMENT",
      },
    })
  }
  const existing = await prisma.clientFile.findFirst({ where: { clientId: resourceId, sha256: saved.sha256 } })
  if (existing) {
    await removeLocalFile(saved.relativePath)
    return existing
  }
  return prisma.clientFile.create({
    data: {
      clientId: resourceId,
      url: saved.relativePath,
      name: saved.originalName,
      size: saved.size,
      type: saved.type,
      sha256: saved.sha256,
    },
  })
}

export async function POST(request: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  return withRouteAuth(undefined, async (context) => {
    const { companyId, membershipId, role } = context
    const { kind: rawKind, id } = await params
    const kind = parseKind(rawKind)
    if (!kind) return Response.json({ error: "Type invalide" }, { status: 400 })

    const writePermission: Permission = kind === "expense" ? "finance.write" : kind === "project" || kind === "intervention" ? "operations.write" : "crm.write"
    const fieldExpenseAccess = kind === "expense" && !hasPermission(role, writePermission) ? await canAccessFieldExpense(id, companyId, membershipId, role, "write") : false
    if (!hasPermission(role, writePermission) && !fieldExpenseAccess) {
      return Response.json({ error: "Accès refusé" }, { status: 403 })
    }

    return requestContext.run({ ...context, actionPermission: fieldExpenseAccess ? "operations.write" : writePermission }, async () => {
      if (!(await resourceExists(kind, id, companyId))) {
        return Response.json({ error: "Ressource introuvable" }, { status: 404 })
      }

      let stored: StoredLocalFile | null = null
      try {
        const contentType = request.headers.get("content-type") || ""
        if (contentType.includes("application/json")) {
          const data = directRequestSchema.parse(await readJsonBody(request, 64 * 1024))
          if (data.action === "abort") {
            await abortDirectFileUpload({ companyId, kind, resourceId: id, storageKey: data.storageKey })
            return Response.json({ success: true })
          }
          if (data.action === "presign") {
            if (!directFileUploadAvailable()) return Response.json({ success: true, direct: false, code: "DIRECT_UPLOAD_UNAVAILABLE" })
            const upload = await createDirectFileUpload({
              companyId,
              kind,
              resourceId: id,
              originalName: data.file.name,
              type: data.file.type,
              size: data.file.size,
              sha256: data.file.sha256,
            })
            return Response.json({ success: true, direct: true, upload })
          }

          stored = await confirmDirectFileUpload({
            companyId,
            kind,
            resourceId: id,
            originalName: data.file.name,
            type: data.file.type,
            size: data.file.size,
            sha256: data.file.sha256,
            storageKey: data.file.storageKey,
          })
          const record = await persistFile(kind, id, stored)
          stored = null
          return Response.json(record, { status: 201 })
        }

        const boundedRequest = new Request(request.url, {
          method: "POST",
          headers: { "content-type": contentType },
          body: Buffer.from(await readBodyBytes(request, MAX_LEGACY_BODY_BYTES)),
        })
        const formData = await boundedRequest.formData()
        const file = formData.get("file")
        if (!(file instanceof File)) return Response.json({ error: "Fichier requis" }, { status: 400 })
        stored = await storeLocalFile({ companyId, kind, resourceId: id, file })
        const record = await persistFile(kind, id, stored)
        stored = null
        return Response.json(record, { status: 201 })
      } catch (error) {
        if (stored) await removeLocalFile(stored.relativePath).catch(() => {})
        if (error instanceof PayloadTooLargeError) {
          return Response.json({ error: "Le mode local est limité à 4 Mo. Configurez R2 pour envoyer jusqu’à 15 Mo." }, { status: 413 })
        }
        if (error instanceof z.ZodError || error instanceof SyntaxError) {
          return Response.json({ error: "Demande de transfert invalide" }, { status: 400 })
        }
        const knownMessage =
          error instanceof Error &&
          [
            "Type de fichier non autorisé",
            "Le fichier dépasse 15 Mo",
            "Le fichier est vide",
            "Le contenu du fichier ne correspond pas à son type",
            "L’intégrité du fichier transféré est invalide",
            "Les caractéristiques du fichier transféré ne correspondent pas",
          ].includes(error.message)
            ? error.message
            : "Échec de l'enregistrement"
        const status = knownMessage === "Le fichier dépasse 15 Mo" ? 413 : knownMessage === "Type de fichier non autorisé" ? 415 : 400
        return Response.json({ error: knownMessage }, { status })
      }
    })
  })
}

export async function GET(_request: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  return withRouteAuth(undefined, async ({ companyId, membershipId, role }) => {
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
  })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  return withRouteAuth(undefined, async (context) => {
    const { companyId, membershipId, role } = context
    const { kind: rawKind, id } = await params
    const kind = parseKind(rawKind)
    if (!kind) return Response.json({ error: "Type invalide" }, { status: 400 })

    const writePermission: Permission = kind === "expense" ? "finance.write" : kind === "project" || kind === "intervention" ? "operations.write" : "crm.write"
    const fieldExpenseAccess = kind === "expense" && !hasPermission(role, writePermission) ? await canAccessFieldExpense(id, companyId, membershipId, role, "write", "file") : false
    if (!hasPermission(role, writePermission) && !fieldExpenseAccess) return Response.json({ error: "Accès refusé" }, { status: 403 })

    return requestContext.run({ ...context, actionPermission: fieldExpenseAccess ? "operations.write" : writePermission }, async () => {
      const file = await findFile(kind, id, companyId)
      if (!file) return Response.json({ error: "Fichier introuvable" }, { status: 404 })

      if (kind === "expense") {
        await prisma.$transaction(async (tx) => {
          const deleted = await tx.expenseFile.delete({ where: { id }, select: { expenseId: true } })
          const remaining = await tx.expenseFile.count({ where: { expenseId: deleted.expenseId } })
          if (!remaining) await tx.expense.update({ where: { id: deleted.expenseId }, data: { status: "TO_JUSTIFY" } })
        })
      } else if (kind === "project") await prisma.projectFile.delete({ where: { id } })
      else if (kind === "intervention") await prisma.interventionFile.delete({ where: { id } })
      else await prisma.clientFile.delete({ where: { id } })
      await removeLocalFile(file.url)

      return Response.json({ ok: true })
    })
  })
}
