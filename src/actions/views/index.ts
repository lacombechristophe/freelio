"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { withAuth } from "@/lib/auth-wrapper"
import prisma from "@/lib/prisma"

const resourceSchema = z.enum(["CLIENTS", "CONTACTS", "LEADS", "OPPORTUNITIES", "QUOTES", "INVOICES", "PROJECTS", "TICKETS", "INTERVENTIONS", "PURCHASES"])
const viewSchema = z.object({
  resource: resourceSchema,
  name: z.string().trim().min(2).max(80),
  visibility: z.enum(["PERSONAL", "TEAM"]).default("PERSONAL"),
  isDefault: z.boolean().default(false),
  config: z.object({
    search: z.string().max(200).optional(),
    filters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])).optional(),
    sort: z.object({ field: z.string().max(80), direction: z.enum(["asc", "desc"]) }).optional(),
    columns: z.array(z.string().max(80)).max(40).optional(),
  }),
})

function serialize(view: {
  id: string
  resource: string
  name: string
  visibility: string
  isDefault: boolean
  config: unknown
  createdAt: Date
  updatedAt: Date
  lastUsedAt: Date | null
}) {
  return {
    ...view,
    config: view.config as Record<string, unknown>,
    createdAt: view.createdAt.toISOString(),
    updatedAt: view.updatedAt.toISOString(),
    lastUsedAt: view.lastUsedAt?.toISOString() ?? null,
  }
}

export async function getSavedViews(resource: string) {
  return withAuth(async ({ companyId, membershipId }) => {
    const parsedResource = resourceSchema.parse(resource)
    const views = await prisma.savedView.findMany({
      where: { companyId, resource: parsedResource, OR: [{ membershipId }, { visibility: "TEAM" }] },
      orderBy: [{ isDefault: "desc" }, { lastUsedAt: "desc" }, { name: "asc" }],
      take: 100,
    })
    return views.map(serialize)
  }, "crm.read")
}

export async function saveSavedView(input: unknown) {
  return withAuth(async ({ companyId, membershipId }) => {
    const data = viewSchema.parse(input)
    if (data.visibility === "TEAM") {
      const membership = await prisma.membership.findFirst({ where: { id: membershipId, companyId, status: "ACTIVE" }, select: { role: true } })
      if (!membership || !["OWNER", "ADMIN"].includes(membership.role)) throw new Error("Seuls les administrateurs peuvent publier une vue à l’équipe")
    }
    const view = await prisma.$transaction(async (tx) => {
      if (data.isDefault) await tx.savedView.updateMany({ where: { companyId, membershipId, resource: data.resource }, data: { isDefault: false } })
      return tx.savedView.upsert({
        where: { companyId_membershipId_resource_name: { companyId, membershipId, resource: data.resource, name: data.name } },
        create: { companyId, membershipId, resource: data.resource, name: data.name, visibility: data.visibility, isDefault: data.isDefault, config: data.config },
        update: { visibility: data.visibility, isDefault: data.isDefault, config: data.config, lastUsedAt: new Date() },
      })
    })
    revalidatePath(`/dashboard/${data.resource.toLowerCase()}`)
    return { success: true as const, view: serialize(view) }
  }, "crm.write")
}

export async function useSavedView(viewId: string) {
  return withAuth(async ({ companyId, membershipId }) => {
    const view = await prisma.savedView.findFirst({ where: { id: viewId, companyId, OR: [{ membershipId }, { visibility: "TEAM" }] }, select: { id: true, resource: true } })
    if (!view) throw new Error("Vue introuvable")
    return { success: true as const }
  }, "crm.read")
}

export async function deleteSavedView(viewId: string) {
  return withAuth(async ({ companyId, membershipId }) => {
    const view = await prisma.savedView.findFirst({ where: { id: viewId, companyId, membershipId }, select: { id: true, resource: true } })
    if (!view) throw new Error("Vue introuvable")
    await prisma.savedView.delete({ where: { id: view.id } })
    revalidatePath(`/dashboard/${view.resource.toLowerCase()}`)
    return { success: true as const }
  }, "crm.write")
}
