import { CheckCircle2, CircleAlert, CreditCard, ExternalLink, ShieldCheck, Users, Warehouse } from "lucide-react"

import { getBillingOverview, openBillingPortal, startCheckout } from "@/actions/billing"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { PageHeader } from "@/components/shared/page-header"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

function euro(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(cents / 100)
}

function usageLabel(value: number, maximum: number) {
  return `${value} sur ${maximum}`
}

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const [overview, query] = await Promise.all([getBillingOverview(), searchParams])
  const current = overview.plans[overview.plan]

  return (
    <div className="workspace-page">
      <PageHeader
        eyebrow="Abonnement SaaS"
        title="Abonnement et capacité"
        description="Pilotez votre forfait, les limites opérationnelles et la facturation sécurisée depuis un point unique."
        actions={overview.hasStripeCustomer ? <form action={openBillingPortal}><Button variant="outline"><ExternalLink />Gérer sur Stripe</Button></form> : undefined}
      />

      {query.checkout === "success" ? <div role="status" className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"><CheckCircle2 className="mt-0.5 size-4 shrink-0" /><div><p className="font-semibold">Paiement confirmé par Stripe</p><p className="mt-1 text-emerald-800">Le forfait se met à jour automatiquement dès réception du webhook signé.</p></div></div> : null}
      {query.checkout === "cancelled" ? <div role="status" className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><CircleAlert className="mt-0.5 size-4 shrink-0" /><div><p className="font-semibold">Souscription interrompue</p><p className="mt-1 text-amber-800">Aucune modification n’a été appliquée à votre forfait.</p></div></div> : null}

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr_1fr]">
        <Card className="border-primary/25 bg-primary/[0.035]">
          <CardHeader>
            <div className="flex items-center justify-between gap-3"><CardTitle>Forfait {current.name}</CardTitle><Badge variant={overview.status === "ACTIVE" ? "default" : "secondary"}>{overview.status}</Badge></div>
            <CardDescription>{current.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-3xl font-semibold tabular-nums">{current.monthlyPriceCents ? `${euro(current.monthlyPriceCents)} HT` : "Gratuit"}<span className="ml-1 text-sm font-normal text-muted-foreground">/ mois</span></p>
            {overview.currentPeriodEnd ? <p className="text-xs text-muted-foreground">Période en cours jusqu’au {new Date(overview.currentPeriodEnd).toLocaleDateString("fr-FR")}{overview.cancelAtPeriodEnd ? " · résiliation programmée" : ""}.</p> : <p className="text-xs text-muted-foreground">Aucun renouvellement payant programmé.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-sm"><Users className="size-4 text-primary" />Équipe</CardTitle><CardDescription>Accès actifs et invitations en attente</CardDescription></CardHeader>
          <CardContent className="space-y-3"><p className="text-2xl font-semibold tabular-nums">{usageLabel(overview.usage.seats, current.limits.seats)}</p><Progress value={Math.min(100, overview.usage.seats / current.limits.seats * 100)} /><p className="text-xs text-muted-foreground">La limite est contrôlée avant chaque invitation.</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-sm"><Warehouse className="size-4 text-primary" />Agences</CardTitle><CardDescription>Agences et magasins actifs</CardDescription></CardHeader>
          <CardContent className="space-y-3"><p className="text-2xl font-semibold tabular-nums">{usageLabel(overview.usage.agencies, current.limits.agencies)}</p><Progress value={Math.min(100, overview.usage.agencies / current.limits.agencies * 100)} /><p className="text-xs text-muted-foreground">Les dépôts restent rattachés à leur agence.</p></CardContent>
        </Card>
      </div>

      {!overview.configured ? <div className="flex items-start gap-3 rounded-xl border bg-muted/35 p-4 text-sm"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" /><div><p className="font-semibold">Souscription en attente de configuration serveur</p><p className="mt-1 text-muted-foreground">Le forfait Alpha reste opérationnel. Les clés, tarifs et webhook Stripe doivent être configurés avant d’ouvrir les offres payantes.</p></div></div> : null}

      <section aria-labelledby="plans-title" className="space-y-4">
        <div><h2 id="plans-title" className="text-xl font-semibold">Choisir la capacité adaptée</h2><p className="mt-1 text-sm text-muted-foreground">Les changements payants passent par Stripe Checkout ; les droits sont appliqués uniquement depuis les événements signés.</p></div>
        <div className="grid gap-4 lg:grid-cols-3">
          {Object.values(overview.plans).map((plan) => {
            const selected = plan.code === overview.plan
            const paid = plan.code !== "ALPHA"
            return <Card key={plan.code} className={cn("flex flex-col", selected && "border-primary shadow-sm")}>
              <CardHeader><div className="flex items-center justify-between gap-3"><CardTitle>{plan.name}</CardTitle>{selected ? <Badge>Actuel</Badge> : null}</div><CardDescription>{plan.description}</CardDescription></CardHeader>
              <CardContent className="flex-1 space-y-4"><p className="text-2xl font-semibold tabular-nums">{plan.monthlyPriceCents ? euro(plan.monthlyPriceCents) : "0 €"}<span className="text-sm font-normal text-muted-foreground"> HT / mois</span></p><ul className="space-y-2 text-sm"><li className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 text-emerald-600" />Jusqu’à {plan.limits.seats} membres</li><li className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 text-emerald-600" />Jusqu’à {plan.limits.agencies} agences</li><li className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 text-emerald-600" />Toutes les fonctions métier du CRM</li></ul></CardContent>
              <CardFooter>{paid && !selected ? <form action={startCheckout} className="w-full"><input type="hidden" name="plan" value={plan.code} /><Button className="w-full" disabled={!overview.configured}><CreditCard />Choisir {plan.name}</Button></form> : <Button className="w-full" variant="outline" disabled>{selected ? "Forfait actuel" : "Offre d’entrée"}</Button>}</CardFooter>
            </Card>
          })}
        </div>
      </section>
    </div>
  )
}
