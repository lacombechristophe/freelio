"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { logAction } from "@/lib/audit"
import { sanitizeSequenceEmailHtml } from "@/lib/automations/email"
import { withAuth } from "@/lib/auth-wrapper"
import prisma from "@/lib/prisma"

const cuid = z.string().cuid()
const macroSchema = z.object({
  name: z.string().trim().min(2).max(120),
  subject: z.string().trim().min(2).max(180),
  bodyText: z.string().trim().min(3).max(10_000),
})

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;")
}

function bodyHtml(value: string) {
  return sanitizeSequenceEmailHtml(`<p>${escapeHtml(value).replace(/\r?\n\r?\n/g, "</p><p>").replace(/\r?\n/g, "<br>")}</p>`)
}

function bodyText(value: string) {
  return value.replace(/<br\s*\/?\s*>/gi, "\n").replace(/<\/p>\s*<p>/gi, "\n\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#0?39;/gi, "'").trim()
}

export async function getServiceMacros() {
  return withAuth(async ({ companyId }) => {
    const macros = await prisma.emailTemplate.findMany({ where: { companyId, category: "SERVICE", status: "ACTIVE" }, orderBy: [{ updatedAt: "desc" }, { name: "asc" }], take: 200 })
    return macros.map((macro) => ({ ...macro, bodyText: bodyText(macro.bodyHtml) }))
  }, "service.read")
}

export async function createServiceMacro(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = macroSchema.parse(input)
    if (await prisma.emailTemplate.findFirst({ where: { companyId, name: data.name }, select: { id: true } })) throw new Error("Un modèle porte déjà ce nom")
    const macro = await prisma.emailTemplate.create({ data: { companyId, category: "SERVICE", status: "ACTIVE", name: data.name, subject: data.subject, bodyHtml: bodyHtml(data.bodyText) } })
    await logAction({ userId, action: "CREATE_SERVICE_MACRO", resource: "EMAIL_TEMPLATE", resourceId: macro.id, payload: { name: macro.name } })
    revalidatePath("/dashboard/service/macros")
    return { success: true as const, id: macro.id }
  }, "service.write")
}

export async function updateServiceMacro(macroId: string, input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const id = cuid.parse(macroId)
    const data = macroSchema.parse(input)
    const macro = await prisma.emailTemplate.findFirst({ where: { id, companyId, category: "SERVICE", status: "ACTIVE" }, select: { id: true } })
    if (!macro) throw new Error("Macro SAV introuvable")
    if (await prisma.emailTemplate.findFirst({ where: { companyId, name: data.name, id: { not: macro.id } }, select: { id: true } })) throw new Error("Un modèle porte déjà ce nom")
    await prisma.emailTemplate.update({ where: { id: macro.id }, data: { name: data.name, subject: data.subject, bodyHtml: bodyHtml(data.bodyText) } })
    await logAction({ userId, action: "UPDATE_SERVICE_MACRO", resource: "EMAIL_TEMPLATE", resourceId: macro.id, payload: { name: data.name } })
    revalidatePath("/dashboard/service/macros")
    return { success: true as const }
  }, "service.write")
}

export async function archiveServiceMacro(macroId: string) {
  return withAuth(async ({ companyId, userId }) => {
    const id = cuid.parse(macroId)
    const macro = await prisma.emailTemplate.findFirst({ where: { id, companyId, category: "SERVICE", status: "ACTIVE" }, select: { id: true, name: true } })
    if (!macro) throw new Error("Macro SAV introuvable")
    await prisma.emailTemplate.update({ where: { id: macro.id }, data: { status: "ARCHIVED" } })
    await logAction({ userId, action: "ARCHIVE_SERVICE_MACRO", resource: "EMAIL_TEMPLATE", resourceId: macro.id, payload: { name: macro.name } })
    revalidatePath("/dashboard/service/macros")
    return { success: true as const }
  }, "service.write")
}
