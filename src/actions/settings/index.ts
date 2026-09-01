"use server"

import prisma from "@/lib/prisma"
import { withAuth } from "@/lib/auth-wrapper"
import { logAction } from "@/lib/audit"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { encrypt } from "@/lib/crypto"
import { invoiceReminderSettingsSchema } from "@/lib/finance/invoice-reminders"

function isValidTimeZone(value: string) {
  try { new Intl.DateTimeFormat("fr-FR", { timeZone: value }).format() } catch { return false }
  return true
}

const CompanySchema = z.object({
  name: z.string().min(2),
  fullName: z.string().optional(),
  siret: z.string().optional(),
  address: z.string().optional(),
  email: z.email().optional().or(z.literal("")),
  phone: z.string().optional(),
  logo: z.string().trim().max(2_000).refine(
    (value) => !value || value.startsWith("/") || /^data:image\/(png|jpeg|webp|gif);base64,/i.test(value) || /^https:\/\//i.test(value),
    "Le logo doit être une URL HTTPS, une ressource locale ou une image intégrée",
  ).optional(),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Couleur attendue au format #RRGGBB").optional(),
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
  iban: z.string().trim().max(80).optional(),
  serviceTimezone: z.string().trim().min(1).max(100).refine(isValidTimeZone, "Fuseau horaire invalide").optional(),
  serviceDayStart: z.number().int().min(0).max(22).optional(),
  serviceDayEnd: z.number().int().min(1).max(23).optional(),
  serviceWorkdays: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),
  serviceHolidays: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(80).optional(),
  serviceFirstResponseHours: z.record(z.enum(["URGENT", "HIGH", "NORMAL", "LOW"]), z.number().min(0.25).max(1_000)).optional(),
  serviceResolutionHours: z.record(z.enum(["URGENT", "HIGH", "NORMAL", "LOW"]), z.number().min(0.25).max(1_000)).optional(),
}).superRefine((value, context) => {
  if (value.serviceDayStart != null && value.serviceDayEnd != null && value.serviceDayStart >= value.serviceDayEnd) context.addIssue({ code: "custom", path: ["serviceDayEnd"], message: "L’heure de fin doit être postérieure à l’ouverture" })
})

export async function updateCompany(data: unknown) {
  return await withAuth(async ({ userId, companyId }) => {
    const validated = CompanySchema.safeParse(data)
    if (!validated.success) {
      return { success: false, error: validated.error.issues[0]?.message ?? "Données invalides" }
    }

    const { iban, ...companyData } = validated.data
    await prisma.company.update({
      where: { id: companyId },
      data: {
        ...companyData,
        ...(iban !== undefined ? { iban: iban ? encrypt(iban.replace(/\s+/g, "").toUpperCase()) : null } : {}),
        logo: validated.data.logo === "" ? null : validated.data.logo,
      },
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
  }, "company.manage")
}

export async function getBillingSettings() {
  return await withAuth(async ({ companyId }) => {
    return await prisma.company.findUnique({
      where: { id: companyId },
      select: { isTvaApplicable: true },
    })
  })
}

export async function updateInvoiceReminderSettings(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const settings = invoiceReminderSettingsSchema.parse(input)
    await prisma.relanceConfig.upsert({
      where: { companyId },
      create: { companyId, enabled: settings.enabled, steps: settings.steps },
      update: { enabled: settings.enabled, steps: settings.steps },
    })
    await logAction({
      userId,
      action: "UPDATE_SETTINGS",
      resource: "INVOICE_REMINDER_SETTINGS",
      resourceId: companyId,
      payload: { enabled: settings.enabled, steps: settings.steps },
    })
    revalidatePath("/dashboard/settings")
    revalidatePath("/dashboard/factures")
    return { success: true as const, settings }
  }, "finance.write")
}
