"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { withAuth } from "@/lib/auth-wrapper"
import { hasPermission } from "@/lib/permissions"
import { isUniqueConstraintConflict } from "@/lib/document-numbering"
import { operationsDashboardScope } from "@/lib/operations/dashboard-scope"
import { assertWarehouseEmpty, WarehouseLifecycleError } from "@/lib/operations/warehouses"
import prisma from "@/lib/prisma"

const id = z.string().cuid()
const revision = z.string().datetime()
const querySchema = z.object({
  search: z.string().trim().max(200).default(""),
  status: z.enum(["ALL", "ACTIVE", "INACTIVE"]).default("ALL"),
  page: z.number().int().min(1).max(1_000_000).default(1),
}).strict()
const fields = z.object({ name: z.string().trim().min(2).max(120), code: z.string().trim().min(1).max(30),
  address: z.string().trim().max(2_000).nullable().transform(value => value || null) })

export async function getWarehouseDirectory(input: unknown = {}) {
  return withAuth(async ({ companyId, agencyIds, role }) => {
    const query = querySchema.parse(input)
    const contains = { contains: query.search, ...(process.env.DATABASE_URL?.startsWith("postgres") ? { mode: "insensitive" as const } : {}) }
    const scope = operationsDashboardScope(companyId, agencyIds).warehouse
    const where = { AND: [scope, ...(query.status === "ALL" ? [] : [{ active: query.status === "ACTIVE" }]),
      ...(query.search ? [{ OR: [{ name: contains }, { code: contains }, { address: contains }] }] : [])] }
    return prisma.$transaction(async tx => {
      const total = await tx.warehouse.count({ where })
      const page = Math.min(query.page, Math.max(1, Math.ceil(total / 25)))
      const items = await tx.warehouse.findMany({ where, select: { id: true, name: true, code: true, address: true, active: true, updatedAt: true,
        agency: { select: { id: true, name: true } } }, orderBy: [{ name: "asc" }, { id: "asc" }], skip: (page - 1) * 25, take: 25 })
      return { items: items.map(item => ({ ...item, updatedAt: item.updatedAt.toISOString() })), total, page, canManage: hasPermission(role, "operations.write") }
    }, { isolationLevel: "Serializable" })
  }, "operations.read")
}

function revalidateWarehouses() {
  revalidatePath("/dashboard/operations")
  revalidatePath("/dashboard/operations/depots")
  revalidatePath("/dashboard/settings/agencies")
}

export async function updateWarehouse(input: unknown) {
  return withAuth(async ({ companyId, userId, agencyIds }) => {
    const { warehouseId, expectedUpdatedAt, ...data } = fields.extend({ warehouseId: id, expectedUpdatedAt: revision }).strict().parse(input)
    const scope = operationsDashboardScope(companyId, agencyIds).warehouse
    try {
      await prisma.$transaction(async tx => {
        const warehouse = await tx.warehouse.findFirst({ where: { id: warehouseId, ...scope } })
        if (!warehouse) throw new WarehouseLifecycleError("Dépôt introuvable")
        const changed = await tx.warehouse.updateMany({ where: { id: warehouseId, ...scope, updatedAt: new Date(expectedUpdatedAt) },
          data: { ...data, updatedAt: new Date(Math.max(Date.now(), warehouse.updatedAt.getTime() + 1)) } })
        if (changed.count !== 1) throw new WarehouseLifecycleError("Ce dépôt a changé. Rechargez la liste ; votre saisie est conservée.")
        await tx.auditLog.create({ data: { userId, action: "UPDATE_WAREHOUSE", resource: "WAREHOUSE", resourceId: warehouseId,
          payload: { fields: (Object.keys(data) as Array<keyof typeof data>).filter(field => warehouse[field] !== data[field]) } } })
      })
    } catch (error) {
      if (isUniqueConstraintConflict(error, "code")) throw new WarehouseLifecycleError("Ce code dépôt existe déjà dans la société.")
      throw error
    }
    revalidateWarehouses()
    return { success: true as const }
  }, "operations.write")
}

export async function setWarehouseActive(input: unknown) {
  return withAuth(async ({ companyId, userId, agencyIds }) => {
    const data = z.object({ warehouseId: id, expectedUpdatedAt: revision, active: z.boolean() }).strict().parse(input)
    const scope = operationsDashboardScope(companyId, agencyIds).warehouse
    await prisma.$transaction(async tx => {
      const warehouse = await tx.warehouse.findFirst({ where: { id: data.warehouseId, ...scope } })
      if (!warehouse) throw new WarehouseLifecycleError("Dépôt introuvable")
      const changed = await tx.warehouse.updateMany({ where: { id: warehouse.id, ...scope, updatedAt: new Date(data.expectedUpdatedAt) },
        data: { active: data.active, updatedAt: new Date(Math.max(Date.now(), warehouse.updatedAt.getTime() + 1)) } })
      if (changed.count !== 1) throw new WarehouseLifecycleError("Ce dépôt a changé. Rechargez la liste avant de modifier son activité.")
      if (!data.active) await assertWarehouseEmpty(tx, companyId, warehouse.id)
      await tx.auditLog.create({ data: { userId, action: "UPDATE_WAREHOUSE", resource: "WAREHOUSE", resourceId: warehouse.id, payload: { active: data.active } } })
    })
    revalidateWarehouses()
    return { success: true as const }
  }, "operations.write")
}
