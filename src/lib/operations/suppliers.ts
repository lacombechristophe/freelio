import { z } from "zod"
import type prisma from "@/lib/prisma"
type Transaction = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

const text = (max: number) => z.string().trim().max(max).optional().nullable().transform(value => value || null)
export const supplierSchema = z.object({
  name: z.string().trim().min(2).max(160),
  code: text(40), contactName: text(200),
  email: z.union([z.string().trim().email().max(254), z.literal("")]).optional().nullable().transform(value => value || null),
  phone: text(40), address: text(2000), paymentTerms: text(2000),
  deliveryDays: z.preprocess(value => value === "" || value == null ? null : value, z.coerce.number().int().min(0).max(365).nullable()),
})

// The conditional write locks this row until the new reference commits. A
// concurrent deactivation therefore either precedes the reference or follows it.
// Preserve the revision: acquiring a lock does not edit supplier coordinates.
export async function lockActiveSupplier(tx: Transaction, companyId: string, supplierId: string) {
  const supplier = await tx.supplier.findFirst({ where: { id: supplierId, companyId, active: true }, select: { updatedAt: true } })
  if (!supplier) throw new Error("Fournisseur introuvable ou inactif")
  const locked = await tx.supplier.updateMany({ where: { id: supplierId, companyId, active: true, updatedAt: supplier.updatedAt }, data: { active: true, updatedAt: supplier.updatedAt } })
  if (locked.count !== 1) throw new Error("Le fournisseur a changé. Rechargez la sélection.")
}
