import { auth } from "@/auth"
import prisma from "@/lib/prisma"
import { redirect } from "next/navigation"
import { SettingsClient } from "./settings-client"
import { PageHeader } from "@/components/shared/page-header"

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/auth/login")

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      aiUsageCount: true,
      passwordHash: true,
      mfaEnabledAt: true,
      company: true,
      _count: { select: { mfaRecoveryCodes: { where: { usedAt: null } } } },
    },
  })

  if (!user || !user.company) redirect("/onboarding")

  return (
    <div className="space-y-7">
      <PageHeader eyebrow="Espace de travail" title="Paramètres" description="Configurez votre identité, la facturation, les documents, les sauvegardes et les intégrations." />
      <SettingsClient company={user.company} user={{
        aiUsageCount: user.aiUsageCount,
        hasPassword: Boolean(user.passwordHash),
        mfaEnabled: Boolean(user.mfaEnabledAt),
        recoveryCodesRemaining: user._count.mfaRecoveryCodes,
      }} />
    </div>
  )
}
