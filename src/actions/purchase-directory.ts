"use server"

import { z } from "zod"
import prisma from "@/lib/prisma"
import { withAuth, type AuthContext } from "@/lib/auth-wrapper"
import { assertAgencyAccess } from "@/lib/agency-access"
import { hasPermission } from "@/lib/permissions"
import { isPublicReadOnlyDemo } from "@/lib/demo-policy"
import { purchaseDirectoryQuery, readPurchaseOrderDirectory, readPurchaseOrderSummary } from "@/lib/operations/purchase-directory"

async function selectedAgencies(context: AuthContext, agencyId?: string) {
  if (!agencyId) return context.agencyIds
  assertAgencyAccess(context.agencyIds, agencyId)
  if (!await prisma.agency.findFirst({ where: { id: agencyId, companyId: context.companyId, active: true }, select: { id: true } })) throw new Error("Agence introuvable ou inactive")
  return [agencyId]
}

export async function getPurchaseOrderDirectory(input: unknown = {}) {
  return withAuth(async context => {
    const query = purchaseDirectoryQuery.parse(input)
    const agencyIds = await selectedAgencies(context, query.agencyId)
    const result = await readPurchaseOrderDirectory(context.companyId, agencyIds, query)
    return { ...result,
      canManagePurchases: hasPermission(context.role, "operations.write") && !isPublicReadOnlyDemo(),
      canApprovePurchases: hasPermission(context.role, "purchases.approve") && !isPublicReadOnlyDemo(),
    }
  }, "operations.read")
}

export async function getPurchaseOrderSummary(input: unknown = {}) {
  return withAuth(async context => {
    const query = z.object({ agencyId: z.string().cuid().optional() }).strict().parse(input)
    return readPurchaseOrderSummary(context.companyId, await selectedAgencies(context, query.agencyId))
  }, "operations.read")
}
