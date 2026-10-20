"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { withAuth } from "@/lib/auth-wrapper"
import { isUniqueConstraintConflict } from "@/lib/document-numbering"
import { siteMetadataSchema, equipmentMetadataSchema } from "@/lib/operations/asset-metadata"
import { assertEquipmentCanDeactivate, assertSiteCanDeactivate, lockActiveSite, lockActiveAssetProduct } from "@/lib/operations/asset-lifecycle"
import { operationsDashboardScope } from "@/lib/operations/dashboard-scope"
import prisma from "@/lib/prisma"
import { AssetLifecycleError } from "@/lib/operations/asset-error"

const revision = z.string().datetime()
const id = z.string().cuid()
const activitySchema = z.object({ id, active: z.boolean(), expectedUpdatedAt: revision }).strict()

function revalidateAssets() {
  revalidatePath("/dashboard/operations")
  revalidatePath("/dashboard/service/equipements/[id]", "page")
}

export async function updateCustomerSite(input: unknown) {
  return withAuth(async ({ companyId, userId, agencyIds }) => {
    const { siteId, expectedUpdatedAt, ...data } = siteMetadataSchema.extend({ siteId: id, expectedUpdatedAt: revision }).strict().parse(input)
    const scope = operationsDashboardScope(companyId, agencyIds).site
    await prisma.$transaction(async tx => {
      const site = await tx.customerSite.findFirst({ where: { ...scope, id: siteId }, select: { updatedAt: true } })
      if (!site) throw new AssetLifecycleError("Site client introuvable")
      const changed = await tx.customerSite.updateMany({ where: { ...scope, id: siteId, updatedAt: new Date(expectedUpdatedAt) },
        data: { ...data, updatedAt: new Date(Math.max(Date.now(), site.updatedAt.getTime() + 1)) } })
      if (changed.count !== 1) throw new AssetLifecycleError("Ce site a changé. Rechargez la liste ; votre saisie est conservée.")
      await tx.auditLog.create({ data: { userId, action: "UPDATE_CUSTOMER_SITE", resource: "CUSTOMER_SITE", resourceId: siteId, payload: { fields: Object.keys(data) } } })
    })
    revalidateAssets()
    return { success: true as const }
  }, "crm.write")
}

export async function updateEquipment(input: unknown) {
  return withAuth(async ({ companyId, userId, agencyIds }) => {
    const { equipmentId, expectedUpdatedAt, ...data } = equipmentMetadataSchema.extend({ equipmentId: id, expectedUpdatedAt: revision }).strict().parse(input)
    const scope = operationsDashboardScope(companyId, agencyIds)
    try {
      await prisma.$transaction(async tx => {
        const equipment = await tx.equipment.findFirst({ where: { ...scope.equipment, id: equipmentId }, select: { updatedAt: true, productId: true } })
        if (!equipment) throw new AssetLifecycleError("Équipement introuvable")
        const changed = await tx.equipment.updateMany({ where: { ...scope.equipment, id: equipmentId, updatedAt: new Date(expectedUpdatedAt) },
          data: { ...data, updatedAt: new Date(Math.max(Date.now(), equipment.updatedAt.getTime() + 1)) } })
        if (changed.count !== 1) throw new AssetLifecycleError("Cet équipement a changé. Rechargez la liste ; votre saisie est conservée.")
        // Retain a historical inactive product; a new assignment must be active.
        if (data.productId && data.productId !== equipment.productId) {
          await lockActiveAssetProduct(tx, companyId, data.productId)
        }
        await tx.auditLog.create({ data: { userId, action: "UPDATE_EQUIPMENT", resource: "EQUIPMENT", resourceId: equipmentId, payload: { fields: Object.keys(data) } } })
      })
    } catch (error) {
      if (isUniqueConstraintConflict(error, "serialNumber")) throw new AssetLifecycleError("Ce numéro de série existe déjà dans la société.")
      throw error
    }
    revalidateAssets()
    return { success: true as const }
  }, "operations.write")
}

export async function setCustomerSiteActive(input: unknown) {
  return withAuth(async ({ companyId, userId, agencyIds }) => {
    const data = activitySchema.parse(input)
    const scope = operationsDashboardScope(companyId, agencyIds).site
    await prisma.$transaction(async tx => {
      const site = await tx.customerSite.findFirst({ where: { ...scope, id: data.id }, select: { id: true, agencyId: true, updatedAt: true } })
      if (!site) throw new AssetLifecycleError("Site client introuvable")
      const changed = await tx.customerSite.updateMany({ where: { ...scope, id: site.id, updatedAt: new Date(data.expectedUpdatedAt) },
        data: { archivedAt: data.active ? null : new Date(), updatedAt: new Date(Math.max(Date.now(), site.updatedAt.getTime() + 1)) } })
      if (changed.count !== 1) throw new AssetLifecycleError("Ce site a changé. Rechargez la liste avant de modifier son activité.")
      if (data.active && site.agencyId && !await tx.agency.findFirst({ where: { id: site.agencyId, companyId, active: true }, select: { id: true } })) throw new AssetLifecycleError("Agence introuvable ou inactive")
      if (!data.active) await assertSiteCanDeactivate(tx, companyId, site.id)
      await tx.auditLog.create({ data: { userId, action: "UPDATE_CUSTOMER_SITE", resource: "CUSTOMER_SITE", resourceId: site.id, payload: { active: data.active } } })
    })
    revalidateAssets()
    return { success: true as const }
  }, "crm.write")
}

export async function setEquipmentActive(input: unknown) {
  return withAuth(async ({ companyId, userId, agencyIds }) => {
    const data = activitySchema.parse(input)
    const scope = operationsDashboardScope(companyId, agencyIds).equipment
    await prisma.$transaction(async tx => {
      const equipment = await tx.equipment.findFirst({ where: { ...scope, id: data.id }, select: { id: true, siteId: true, updatedAt: true } })
      if (!equipment) throw new AssetLifecycleError("Équipement introuvable")
      if (data.active) await lockActiveSite(tx, companyId, equipment.siteId, agencyIds)
      const changed = await tx.equipment.updateMany({ where: { ...scope, id: equipment.id, updatedAt: new Date(data.expectedUpdatedAt), siteId: equipment.siteId },
        data: { archivedAt: data.active ? null : new Date(), updatedAt: new Date(Math.max(Date.now(), equipment.updatedAt.getTime() + 1)) } })
      if (changed.count !== 1) throw new AssetLifecycleError("Cet équipement a changé. Rechargez la liste avant de modifier son activité.")
      if (!data.active) await assertEquipmentCanDeactivate(tx, companyId, equipment.id)
      await tx.auditLog.create({ data: { userId, action: "UPDATE_EQUIPMENT", resource: "EQUIPMENT", resourceId: equipment.id, payload: { active: data.active } } })
    })
    revalidateAssets()
    return { success: true as const }
  }, "operations.write")
}
