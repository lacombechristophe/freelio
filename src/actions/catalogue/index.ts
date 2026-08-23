"use server"

import prisma from "@/lib/prisma"
import { withAuth } from "@/lib/auth-wrapper"
import { revalidatePath } from "next/cache"
import { ServiceSchema, ServiceCategorySchema } from "@/lib/validations"

export async function getServices() {
  return await withAuth(async ({ companyId }) => {
    return await prisma.service.findMany({
      where: { companyId },
      include: { category: true },
      orderBy: { label: "asc" },
    })
  })
}

export async function getServiceCategories() {
  return await withAuth(async ({ companyId }) => {
    return await prisma.serviceCategory.findMany({
      where: { companyId },
      orderBy: { name: "asc" },
    })
  })
}

export async function createService(data: any) {
  return await withAuth(async ({ companyId }) => {
    const validated = ServiceSchema.parse(data)
    const service = await prisma.service.create({
      data: {
        companyId,
        code: validated.code || null,
        label: validated.label,
        description: validated.description || null,
        priceCents: validated.priceCents,
        unit: validated.unit,
        tvaRate: validated.tvaRate,
        categoryId: validated.categoryId || null,
      },
    })
    revalidatePath("/dashboard/catalogue")
    return service
  })
}

export async function updateService(id: string, data: any) {
  return await withAuth(async ({ companyId }) => {
    const validated = ServiceSchema.parse(data)
    const existing = await prisma.service.findFirst({ where: { id, companyId } })
    if (!existing) throw new Error("Service introuvable")
    const service = await prisma.service.update({
      where: { id },
      data: {
        code: validated.code || null,
        label: validated.label,
        description: validated.description || null,
        priceCents: validated.priceCents,
        unit: validated.unit,
        tvaRate: validated.tvaRate,
        categoryId: validated.categoryId || null,
      },
    })
    revalidatePath("/dashboard/catalogue")
    return service
  })
}

export async function deleteService(id: string) {
  return await withAuth(async ({ companyId }) => {
    const existing = await prisma.service.findFirst({ where: { id, companyId } })
    if (!existing) throw new Error("Service introuvable")
    await prisma.service.delete({ where: { id } })
    revalidatePath("/dashboard/catalogue")
    return { ok: true }
  })
}

export async function createServiceCategory(data: any) {
  return await withAuth(async ({ companyId }) => {
    const validated = ServiceCategorySchema.parse(data)
    const cat = await prisma.serviceCategory.create({
      data: { companyId, name: validated.name },
    })
    revalidatePath("/dashboard/catalogue")
    return cat
  })
}
