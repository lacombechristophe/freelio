"use server"

import prisma from "@/lib/prisma"
import { withAuth } from "@/lib/auth-wrapper"
import { revalidatePath } from "next/cache"
import { logAction } from "@/lib/audit"
import { ExpenseSchema } from "@/lib/validations"
import { removeLocalFile } from "@/lib/local-files"
import { boundedPageSize } from "@/lib/pagination"

async function validateExpenseRelations(companyId: string, clientId: string | null, projectId: string | null) {
  const [client, project] = await Promise.all([
    clientId ? prisma.client.findFirst({ where: { id: clientId, companyId }, select: { id: true } }) : null,
    projectId ? prisma.project.findFirst({ where: { id: projectId, companyId }, select: { id: true, clientId: true } }) : null,
  ])

  if (clientId && !client) throw new Error("Client introuvable")
  if (projectId && !project) throw new Error("Chantier introuvable ou inaccessible")
  if (clientId && project && project.clientId !== clientId) throw new Error("Le chantier sélectionné n’appartient pas à ce client")
}

export async function getExpenses(cursor?: string, limit = 50) {
  return await withAuth(async ({ companyId }) => {
    const pageSize = boundedPageSize(limit, 50, 100)
    return await prisma.expense.findMany({
      where: { companyId },
      take: pageSize,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      include: {
        files: { select: { id: true, url: true } },
        project: { select: { id: true, name: true } },
        client: { select: { id: true, name: true } },
      },
      orderBy: { date: "desc" },
    })
  })
}

export async function createExpense(data: unknown) {
  return await withAuth(async ({ userId, companyId, agencyIds }) => {
    const validated = ExpenseSchema.parse(data)
    const clientId = validated.clientId || null
    const projectId = validated.projectId || null
    if (agencyIds !== null && !projectId) throw new Error("Sélectionnez un chantier rattaché à votre agence")
    await validateExpenseRelations(companyId, clientId, projectId)
    const expense = await prisma.expense.create({
      data: {
        companyId,
        label: validated.label,
        provider: validated.provider || null,
        amountCents: validated.amountCents,
        tvaCents: validated.tvaCents ?? 0,
        date: new Date(validated.date),
        category: validated.category,
        status: "TO_JUSTIFY",
        clientId,
        projectId,
      },
    })
    await logAction({
      userId,
      action: "CREATE_EXPENSE",
      resource: "EXPENSE",
      resourceId: expense.id,
      payload: { label: validated.label, amountCents: validated.amountCents },
    })
    revalidatePath("/dashboard/depenses")
    return expense
  })
}

export async function updateExpense(id: string, data: unknown) {
  return await withAuth(async ({ companyId, userId, agencyIds }) => {
    const validated = ExpenseSchema.parse(data)
    const existing = await prisma.expense.findFirst({ where: { id, companyId } })
    if (!existing) throw new Error("Dépense introuvable")
    const clientId = validated.clientId || null
    const projectId = validated.projectId || null
    if (agencyIds !== null && !projectId) throw new Error("Sélectionnez un chantier rattaché à votre agence")
    await validateExpenseRelations(companyId, clientId, projectId)

    const expense = await prisma.expense.update({
      where: { id },
      data: {
        label: validated.label,
        provider: validated.provider || null,
        amountCents: validated.amountCents,
        tvaCents: validated.tvaCents ?? 0,
        date: new Date(validated.date),
        category: validated.category,
        clientId,
        projectId,
      },
    })
    await logAction({
      userId,
      action: "UPDATE_EXPENSE",
      resource: "EXPENSE",
      resourceId: id,
    })
    revalidatePath("/dashboard/depenses")
    return expense
  })
}

export async function deleteExpense(id: string) {
  return await withAuth(async ({ companyId, userId }) => {
    const existing = await prisma.expense.findFirst({
      where: { id, companyId },
      include: { files: { select: { url: true } } },
    })
    if (!existing) throw new Error("Dépense introuvable")

    await prisma.expense.delete({ where: { id } })
    await Promise.all(existing.files.map((file) => removeLocalFile(file.url)))
    await logAction({
      userId,
      action: "DELETE_EXPENSE",
      resource: "EXPENSE",
      resourceId: id,
      payload: { label: existing.label },
    })
    revalidatePath("/dashboard/depenses")
    return { ok: true }
  })
}

export async function markExpenseJustified(id: string) {
  return await withAuth(async ({ companyId }) => {
    const existing = await prisma.expense.findFirst({ where: { id, companyId } })
    if (!existing) throw new Error("Dépense introuvable")
    await prisma.expense.update({ where: { id }, data: { status: "JUSTIFIED" } })
    revalidatePath("/dashboard/depenses")
    return { ok: true }
  })
}
