"use server"

import { Prisma } from "@prisma/client"
import prisma from "@/lib/prisma"
import { withAuth } from "@/lib/auth-wrapper"
import { revalidatePath } from "next/cache"
import { logAction } from "@/lib/audit"
import { ExpenseSchema } from "@/lib/validations"
import { removeLocalFile } from "@/lib/local-files"
import { boundedPageSize } from "@/lib/pagination"

function expenseWhere(companyId: string): Prisma.ExpenseWhereInput {
  return {
    companyId,
    AND: [
      { OR: [{ clientId: null }, { client: { companyId } }] },
      { OR: [{ projectId: null }, { project: { companyId, client: { companyId } } }] },
    ],
  }
}

async function writeExpense<T>(query: PromiseLike<T>): Promise<T> {
  try { return await query }
  catch (error) {
    // Conditional writes also refuse a relation changed after the initial read.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") throw new Error("Dépense introuvable")
    throw error
  }
}

async function validateExpenseRelations(companyId: string, clientId: string | null, projectId: string | null) {
  const [client, project] = await Promise.all([
    clientId ? prisma.client.findFirst({ where: { id: clientId, companyId }, select: { id: true } }) : null,
    projectId ? prisma.project.findFirst({ where: { id: projectId, companyId, client: { companyId } }, select: { id: true, clientId: true } }) : null,
  ])

  if (clientId && !client) throw new Error("Client introuvable")
  if (projectId && !project) throw new Error("Chantier introuvable ou inaccessible")
  if (clientId && project && project.clientId !== clientId) throw new Error("Le chantier sélectionné n’appartient pas à ce client")
}

export async function getExpenses(cursor?: string, limit = 50) {
  return await withAuth(async ({ companyId }) => {
    const pageSize = boundedPageSize(limit, 50, 100)
    return await prisma.expense.findMany({
      where: expenseWhere(companyId),
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
  }, "finance.read")
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
  }, "finance.write")
}

export async function updateExpense(id: string, data: unknown) {
  return await withAuth(async ({ companyId, userId, agencyIds }) => {
    const validated = ExpenseSchema.parse(data)
    const existing = await prisma.expense.findFirst({ where: { ...expenseWhere(companyId), id } })
    if (!existing) throw new Error("Dépense introuvable")
    const clientId = validated.clientId || null
    const projectId = validated.projectId || null
    if (agencyIds !== null && !projectId) throw new Error("Sélectionnez un chantier rattaché à votre agence")
    await validateExpenseRelations(companyId, clientId, projectId)

    const expense = await writeExpense(prisma.expense.update({
      where: { ...expenseWhere(companyId), id },
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
    }))
    await logAction({
      userId,
      action: "UPDATE_EXPENSE",
      resource: "EXPENSE",
      resourceId: id,
    })
    revalidatePath("/dashboard/depenses")
    return expense
  }, "finance.write")
}

export async function deleteExpense(id: string) {
  return await withAuth(async ({ companyId, userId }) => {
    const existing = await prisma.expense.findFirst({
      where: { ...expenseWhere(companyId), id },
      include: { files: { select: { url: true } } },
    })
    if (!existing) throw new Error("Dépense introuvable")

    await writeExpense(prisma.expense.delete({ where: { ...expenseWhere(companyId), id } }))
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
  }, "finance.write")
}

export async function markExpenseJustified(id: string) {
  return await withAuth(async ({ companyId }) => {
    const existing = await prisma.expense.findFirst({ where: { ...expenseWhere(companyId), id } })
    if (!existing) throw new Error("Dépense introuvable")
    await writeExpense(prisma.expense.update({ where: { ...expenseWhere(companyId), id }, data: { status: "JUSTIFIED" } }))
    revalidatePath("/dashboard/depenses")
    return { ok: true }
  }, "finance.write")
}
