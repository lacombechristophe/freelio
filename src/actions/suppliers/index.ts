"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import prisma from "@/lib/prisma"
import { withAuth } from "@/lib/auth-wrapper"
import { logAction } from "@/lib/audit"
import { supplierSchema } from "@/lib/operations/suppliers"
import { isUniqueConstraintConflict } from "@/lib/document-numbering"
import { readSupplierProducts, readSupplierOrders, readSupplierReturns, supplierHistoryQuery } from "@/lib/operations/supplier-history"

const id = z.string().cuid()
const contains = (search: string) => ({ contains: search, ...(process.env.DATABASE_URL?.startsWith("postgres") ? { mode: "insensitive" as const } : {}) })
const querySchema = z.object({
  search: z.string().trim().max(200).default(""),
  status: z.enum(["ALL", "ACTIVE", "INACTIVE"]).default("ALL"),
  page: z.number().int().min(1).max(1_000_000).default(1),
})

export async function getSupplierProductHistory(supplierId: string, input: unknown = {}) {
  return withAuth(async ({ companyId, agencyIds }) => {
    const scope = { companyId, agencyIds, supplierId: id.parse(supplierId) }
    const query = supplierHistoryQuery.parse(input)
    return prisma.$transaction(async tx => {
      if (!await tx.supplier.findFirst({ where: { id: scope.supplierId, companyId }, select: { id: true } })) throw new Error("Fournisseur introuvable")
      return readSupplierProducts(tx, scope, query)
    }, { isolationLevel: "Serializable" })
  }, "operations.read")
}

export async function getSupplierOrderHistory(supplierId: string, input: unknown = {}) {
  return withAuth(async ({ companyId, agencyIds }) => {
    const scope = { companyId, agencyIds, supplierId: id.parse(supplierId) }
    const query = supplierHistoryQuery.parse(input)
    return prisma.$transaction(async tx => {
      if (!await tx.supplier.findFirst({ where: { id: scope.supplierId, companyId }, select: { id: true } })) throw new Error("Fournisseur introuvable")
      return readSupplierOrders(tx, scope, query)
    }, { isolationLevel: "Serializable" })
  }, "operations.read")
}

export async function getSupplierReturnHistory(supplierId: string, input: unknown = {}) {
  return withAuth(async ({ companyId, agencyIds }) => {
    const scope = { companyId, agencyIds, supplierId: id.parse(supplierId) }
    const query = supplierHistoryQuery.parse(input)
    return prisma.$transaction(async tx => {
      if (!await tx.supplier.findFirst({ where: { id: scope.supplierId, companyId }, select: { id: true } })) throw new Error("Fournisseur introuvable")
      return readSupplierReturns(tx, scope, query)
    }, { isolationLevel: "Serializable" })
  }, "operations.read")
}

export async function getSupplierDirectory(input: unknown = {}) {
  return withAuth(async ({ companyId }) => {
    const query = querySchema.parse(input)
    const where = { companyId, ...(query.status === "ALL" ? {} : { active: query.status === "ACTIVE" }),
      ...(query.search ? { OR: ["name", "code", "contactName"].map(field => ({ [field]: contains(query.search) })) } : {}) }
    return prisma.$transaction(async tx => {
      const total = await tx.supplier.count({ where })
      const page = Math.min(query.page, Math.max(1, Math.ceil(total / 25)))
      const items = await tx.supplier.findMany({ where, orderBy: [{ name: "asc" }, { id: "asc" }], skip: (page - 1) * 25, take: 25,
        select: { id: true, name: true, code: true, contactName: true, active: true } })
      return { items, total, page }
    }, { isolationLevel: "Serializable" })
  }, "operations.read")
}

export async function getSupplierChoices(input: unknown = {}) {
  return withAuth(async ({ companyId }) => {
    const query = querySchema.extend({ selectedId: id.optional(), productId: id.optional() }).parse(input)
    const where = { companyId, active: true, ...(query.search ? { OR: [{ name: contains(query.search) }, { code: contains(query.search) }] } : {}) }
    return prisma.$transaction(async tx => {
      const total = await tx.supplier.count({ where })
      const page = Math.min(query.page, Math.max(1, Math.ceil(total / 25)))
      const select = { id: true, name: true, active: true } as const
      const items = await tx.supplier.findMany({ where, select, skip: (page - 1) * 25, take: 25, orderBy: [{ name: "asc" }, { id: "asc" }] })
      const retained = query.productId && query.selectedId ? await tx.product.findFirst({ where: { id: query.productId, companyId, supplierId: query.selectedId }, select: { id: true } }) : null
      const selected = query.selectedId ? await tx.supplier.findFirst({ where: { id: query.selectedId, companyId, ...(retained ? {} : { active: true }) }, select }) : null
      return { items, selected, total, page }
    }, { isolationLevel: "Serializable" })
  }, "operations.read")
}

function revalidateSupplier(supplierId: string) {
  revalidatePath("/dashboard/operations")
  revalidatePath("/dashboard/operations/fournisseurs")
  revalidatePath(`/dashboard/operations/fournisseurs/${supplierId}`)
  revalidatePath("/dashboard/catalogue")
}

export async function updateSupplier(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const { supplierId, expectedUpdatedAt, ...data } = supplierSchema.extend({ supplierId: id, expectedUpdatedAt: z.string().datetime() }).parse(input)
    let fields: string[]
    try {
      fields = await prisma.$transaction(async tx => {
        const existing = await tx.supplier.findFirst({ where: { id: supplierId, companyId } })
        if (!existing) throw new Error("Fournisseur introuvable")
        const updatedAt = new Date(Math.max(Date.now(), existing.updatedAt.getTime() + 1))
        const changed = await tx.supplier.updateMany({ where: { id: supplierId, companyId, updatedAt: new Date(expectedUpdatedAt) }, data: { ...data, updatedAt } })
        if (changed.count !== 1) throw new Error("Ce fournisseur a changé. Rechargez sa fiche avant de modifier ; votre saisie est conservée.")
        return (Object.keys(data) as Array<keyof typeof data>).filter(field => existing[field] !== data[field])
      })
    } catch (error) {
      if (isUniqueConstraintConflict(error, "name") || isUniqueConstraintConflict(error, "code")) throw new Error("Ce nom ou ce code fournisseur existe déjà.")
      throw error
    }
    await logAction({ userId, action: "UPDATE_SUPPLIER", resource: "SUPPLIER", resourceId: supplierId, payload: { fields } })
    revalidateSupplier(supplierId)
    return { success: true as const }
  }, "operations.write")
}

export async function setSupplierActive(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = z.object({ supplierId: id, active: z.boolean(), expectedUpdatedAt: z.string().datetime() }).parse(input)
    const previous = new Date(data.expectedUpdatedAt)
    const changed = await prisma.supplier.updateMany({ where: { id: data.supplierId, companyId, updatedAt: previous }, data: { active: data.active, updatedAt: new Date(Math.max(Date.now(), previous.getTime() + 1)) } })
    if (changed.count !== 1) throw new Error("Ce fournisseur a changé ou n’est plus accessible. Rechargez sa fiche.")
    await logAction({ userId, action: "UPDATE_SUPPLIER", resource: "SUPPLIER", resourceId: data.supplierId, payload: { active: data.active } })
    revalidateSupplier(data.supplierId)
    return { success: true as const }
  }, "operations.write")
}
