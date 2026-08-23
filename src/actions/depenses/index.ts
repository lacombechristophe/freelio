"use server"

import prisma from "@/lib/prisma"
import { withAuth } from "@/lib/auth-wrapper"
import { revalidatePath } from "next/cache"
import { logAction } from "@/lib/audit"
import { ExpenseSchema } from "@/lib/validations"
import { removeLocalFile } from "@/lib/local-files"

export async function getExpenses(cursor?: string, limit = 50) {
  return await withAuth(async ({ companyId }) => {
    return await prisma.expense.findMany({
      where: { companyId },
      take: limit,
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

export async function createExpense(data: any) {
  return await withAuth(async ({ userId, companyId }) => {
    const validated = ExpenseSchema.parse(data)
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
        clientId: validated.clientId || null,
        projectId: validated.projectId || null,
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

export async function updateExpense(id: string, data: any) {
  return await withAuth(async ({ companyId, userId }) => {
    const validated = ExpenseSchema.parse(data)
    const existing = await prisma.expense.findFirst({ where: { id, companyId } })
    if (!existing) throw new Error("Dépense introuvable")

    const expense = await prisma.expense.update({
      where: { id },
      data: {
        label: validated.label,
        provider: validated.provider || null,
        amountCents: validated.amountCents,
        tvaCents: validated.tvaCents ?? 0,
        date: new Date(validated.date),
        category: validated.category,
        clientId: validated.clientId || null,
        projectId: validated.projectId || null,
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
