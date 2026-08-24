import type { Metadata } from "next"

import { WithdrawalCard } from "@/app/consent/withdraw/[token]/withdrawal-card"
import { AppBrand } from "@/components/shared/app-brand"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { verifyConsentWithdrawalToken } from "@/lib/leads/consent-token"
import prisma from "@/lib/prisma"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Préférences de communication",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}

export default async function ConsentWithdrawalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const payload = await verifyConsentWithdrawalToken(token)
  const company = payload ? await prisma.company.findUnique({
    where: { id: payload.companyId },
    select: { name: true, logo: true, brandColor: true },
  }) : null

  return (
    <main className="min-h-screen bg-background px-5 py-8 text-foreground">
      <div className="mx-auto w-full max-w-lg">
        <AppBrand href="/" brand={company ?? undefined} />
        <div className="mt-10">
          {payload && company ? <WithdrawalCard token={token} companyName={company.name} /> : (
            <Card>
              <CardHeader>
                <CardTitle>Lien indisponible</CardTitle>
                <CardDescription>Ce lien de préférence n'est pas valide. Contactez l’entreprise émettrice si vous souhaitez exercer vos droits.</CardDescription>
              </CardHeader>
            </Card>
          )}
        </div>
      </div>
    </main>
  )
}
