import { auth } from "@/auth"
import prisma from "@/lib/prisma"
import { redirect } from "next/navigation"
import { SettingsClient } from "./settings-client"
import { PageHeader } from "@/components/shared/page-header"
import { decryptSensitive } from "@/lib/crypto"

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/auth/login")

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      aiUsageCount: true,
      passwordHash: true,
      mfaEnabledAt: true,
      company: {
        select: {
          id: true,
          name: true,
          fullName: true,
          siret: true,
          address: true,
          email: true,
          phone: true,
          logo: true,
          brandColor: true,
          apeCode: true,
          rcsNumber: true,
          iban: true,
          isTvaApplicable: true,
          latePenaltyRate: true,
          invoicePrefix: true,
          quotePrefix: true,
          pdfTemplate: true,
          eInvoicePlatform: true,
          eInvoiceRoutingId: true,
          serviceTimezone: true,
          serviceDayStart: true,
          serviceDayEnd: true,
          serviceWorkdays: true,
          serviceHolidays: true,
          serviceFirstResponseHours: true,
          serviceResolutionHours: true,
          lastBackupAt: true,
        },
      },
      _count: { select: { mfaRecoveryCodes: { where: { usedAt: null } } } },
    },
  })

  if (!user || !user.company) redirect("/onboarding")

  return (
    <div className="space-y-7">
      <PageHeader eyebrow="Espace de travail" title="Paramètres" description="Configurez votre identité, la facturation, les documents, les sauvegardes et les intégrations." />
      <SettingsClient company={{ ...user.company, iban: decryptSensitive(user.company.iban) }} user={{
        aiUsageCount: user.aiUsageCount,
        hasPassword: Boolean(user.passwordHash),
        mfaEnabled: Boolean(user.mfaEnabledAt),
        recoveryCodesRemaining: user._count.mfaRecoveryCodes,
        integrations: {
          gemini: Boolean(process.env.GEMINI_API_KEY?.trim()),
          email: Boolean(process.env.RESEND_API_KEY?.trim() && process.env.RESEND_WEBHOOK_SECRET?.trim()),
          storage: Boolean(
            process.env.R2_ACCOUNT_ID?.trim()
            && process.env.R2_BUCKET_NAME?.trim()
            && (process.env.R2_ACCESS_KEY_ID?.trim() || process.env.R2_ACCESS_KEY?.trim())
            && (process.env.R2_SECRET_ACCESS_KEY?.trim() || process.env.R2_SECRET_KEY?.trim()),
          ),
          billing: Boolean(process.env.STRIPE_SECRET_KEY?.trim() && process.env.STRIPE_WEBHOOK_SECRET?.trim()),
        },
      }} />
    </div>
  )
}
