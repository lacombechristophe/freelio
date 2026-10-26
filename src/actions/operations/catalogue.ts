"use server"

import { withAuth } from "@/lib/auth-wrapper"
import { AssetLifecycleError } from "@/lib/operations/asset-error"
import { logAction } from "@/lib/audit"
import { isUniqueConstraintConflict } from "@/lib/document-numbering"
import { lockActiveSite, lockActiveAssetProduct } from "@/lib/operations/asset-lifecycle"
import prisma from "@/lib/prisma"
import { supplierSchema, lockActiveSupplier } from "@/lib/operations/suppliers"
import {
  siteSchema,
  productSchema,
  warehouseSchema,
  equipmentSchema,
} from "./schemas"
import { revalidateOperations } from "./revalidation"

export async function createCustomerSite(input: unknown) {
  return withAuth(async ({ companyId }) => {
    const data = siteSchema.parse(input)
    const [client, requestedAgency, defaultAgency] = await Promise.all([
      prisma.client.findFirst({ where: { id: data.clientId, companyId }, select: { id: true } }),
      data.agencyId ? prisma.agency.findFirst({ where: { id: data.agencyId, companyId, active: true }, select: { id: true } }) : null,
      data.agencyId ? null : prisma.agency.findFirst({ where: { companyId, isDefault: true, active: true }, select: { id: true } }),
    ])
    if (!client) throw new AssetLifecycleError("Client introuvable")
    if (data.agencyId && !requestedAgency) throw new AssetLifecycleError("Agence introuvable ou inactive")
    const site = await prisma.customerSite.create({ data: { companyId, ...data, agencyId: requestedAgency?.id || defaultAgency?.id || null } })
    revalidateOperations()
    return { success: true as const, id: site.id }
  }, "crm.write")
}

export async function createSupplier(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = supplierSchema.parse(input)
    let supplier
    try { supplier = await prisma.supplier.create({ data: { companyId, ...data } }) } catch (error) {
      if (isUniqueConstraintConflict(error, "name") || isUniqueConstraintConflict(error, "code")) throw new Error("Ce nom ou ce code fournisseur existe déjà.")
      throw error
    }
    await logAction({ userId, action: "CREATE_SUPPLIER", resource: "SUPPLIER", resourceId: supplier.id, payload: { fields: Object.keys(data) } })
    revalidateOperations()
    return { success: true as const, id: supplier.id }
  }, "operations.write")
}

export async function createProduct(input: unknown) {
  return withAuth(async ({ companyId }) => {
    const data = productSchema.parse(input)
    const product = await prisma.$transaction(async tx => {
      if (data.supplierId) await lockActiveSupplier(tx, companyId, data.supplierId)
      return tx.product.create({ data: { companyId, ...data } })
    })
    revalidateOperations()
    return { success: true as const, id: product.id }
  }, "operations.write")
}

export async function createWarehouse(input: unknown) {
  return withAuth(async ({ companyId }) => {
    const data = warehouseSchema.parse(input)
    const agency = data.agencyId
      ? await prisma.agency.findFirst({ where: { id: data.agencyId, companyId, active: true }, select: { id: true } })
      : await prisma.agency.findFirst({ where: { companyId, isDefault: true, active: true }, select: { id: true } })
    if (data.agencyId && !agency) throw new Error("Agence introuvable ou inactive")
    const warehouse = await prisma.warehouse.create({ data: { companyId, ...data, agencyId: agency?.id || null } })
    revalidateOperations()
    return { success: true as const, id: warehouse.id }
  }, "operations.write")
}

export async function createEquipment(input: unknown) {
  return withAuth(async ({ companyId, agencyIds }) => {
    const data = equipmentSchema.parse(input)
    const equipment = await prisma.$transaction(async tx => {
      await lockActiveSite(tx, companyId, data.siteId, agencyIds)
      if (data.productId) await lockActiveAssetProduct(tx, companyId, data.productId)
      return tx.equipment.create({ data: { companyId, ...data } })
    }).catch(error => {
      if (isUniqueConstraintConflict(error, "serialNumber")) throw new AssetLifecycleError("Ce numéro de série existe déjà dans la société.")
      throw error
    })
    revalidateOperations()
    return { success: true as const, id: equipment.id }
  }, "operations.write")
}
