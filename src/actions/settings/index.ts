"use server"

import prisma from "@/lib/prisma"
import { withAuth } from "@/lib/auth-wrapper"
import { logAction } from "@/lib/audit"
import { revalidatePath } from "next/cache"
import { z } from "zod"

const CompanySchema = z.object({
  name: z.string().min(2),
  fullName: z.string().optional(),
  siret: z.string().optional(),
  address: z.string().optional(),
  email: z.email().optional().or(z.literal("")),
  phone: z.string().optional(),
  apeCode: z.string().optional(),
  rcsNumber: z.string().optional(),
  isTvaApplicable: z.boolean().optional(),
  latePenaltyRate: z.number().min(0).max(100).optional(),
  invoicePrefix: z.string().min(1).max(20).optional(),
  quotePrefix: z.string().min(1).max(20).optional(),
  pdfTemplate: z.enum(["MINIMAL", "PROFESSIONAL", "MODERN"]).optional(),
  socialContributionRate: z.number().min(0).max(100).optional(),
  tvaThresholdCents: z.number().int().positive().optional(),
  tvaMajorThresholdCents: z.number().int().positive().optional(),
  eInvoicePlatform: z.string().trim().max(120).optional(),
  eInvoiceRoutingId: z.string().trim().max(180).optional(),
})

export async function updateCompany(data: unknown) {
  return await withAuth(async ({ userId, companyId }) => {
    const validated = CompanySchema.safeParse(data)
    if (!validated.success) {
      return { success: false, error: validated.error.issues[0]?.message ?? "Données invalides" }
    }

    await prisma.company.update({
      where: { id: companyId },
      data: validated.data,
    })

    await logAction({
      userId,
      action: "UPDATE_SETTINGS",
      resource: "COMPANY",
      resourceId: companyId,
      payload: { updated: Object.keys(validated.data) },
    })

    revalidatePath("/dashboard/settings")
    return { success: true }
  })
}

export async function getBillingSettings() {
  return await withAuth(async ({ companyId }) => {
    return await prisma.company.findUnique({
      where: { id: companyId },
      select: { isTvaApplicable: true },
    })
  })
}
