import Link from "next/link"
import {
  TrendingUp, AlertCircle, Receipt, Calendar, CheckCircle2, Download, Landmark,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getAccountingSnapshot } from "@/actions/accounting"
import { OnboardingRequired } from "@/components/shared/onboarding-required"
import { PageHeader } from "@/components/shared/page-header"

function formatEuro(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100)
}

function formatDate(d: Date | string) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })
}

export default async function ComptabilitePage() {
  const snapshot = await getAccountingSnapshot()

  if (!snapshot) {
    return (
      <OnboardingRequired
        title="Configurez votre comptabilité"
        description="Terminez l’onboarding pour suivre votre chiffre d’affaires, votre TVA et votre trésorerie."
      />
    )
  }

  const year = new Date().getFullYear()
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Pilotage financier"
        title="Finance & comptabilité"
        description="Pilotez facturation, encaissements, encours, TVA et rentabilité, puis transmettez un export contrôlé au cabinet comptable."
        actions={<>
          <a href="/api/accounting/export"><Button variant="outline" className="gap-2"><Download className="h-4 w-4" /> Export comptable</Button></a>
          <Link href="/dashboard/comptabilite/banque"><Button variant="outline" className="gap-2"><Landmark className="h-4 w-4" /> Banque</Button></Link>
          <Link href="/dashboard/factures"><Button variant="outline" className="gap-2"><Receipt className="h-4 w-4" /> Voir les factures</Button></Link>
        </>}
      />

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
              Facturé HT ({year})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatEuro(snapshot.caYearCents)}</div>
            <p className="mt-2 text-xs text-muted-foreground">{formatEuro(snapshot.billedYearTtcCents)} TTC, avoirs déduits</p>
          </CardContent>
        </Card>

        <Card className="bg-primary/5 border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium uppercase tracking-widest text-primary/70">Encaissé ({year})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatEuro(snapshot.paidYearCents)}</div>
            <p className="mt-2 text-xs text-muted-foreground">Tous règlements enregistrés sur la période</p>
          </CardContent>
        </Card>

        <Card className={snapshot.overdueCount ? "border-danger/40" : undefined}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium uppercase tracking-widest text-muted-foreground">Encours client</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatEuro(snapshot.outstandingCents)}</div>
            <p className={snapshot.overdueCount ? "mt-2 flex items-center gap-1 text-xs text-danger" : "mt-2 text-xs text-muted-foreground"}>{snapshot.overdueCount ? <AlertCircle className="size-3.5" /> : null}{snapshot.overdueCount} échéance{snapshot.overdueCount > 1 ? "s" : ""} dépassée{snapshot.overdueCount > 1 ? "s" : ""} · {formatEuro(snapshot.overdueCents)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium uppercase tracking-widest text-muted-foreground">TVA indicative</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{snapshot.isTvaApplicable ? formatEuro(snapshot.tvaBalanceCents) : "Non applicable"}</div>
            <p className="mt-2 text-xs text-muted-foreground">Collectée {formatEuro(snapshot.tvaCollectedCents)} · déductible {formatEuro(snapshot.tvaDeductibleCents)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Prévision d&apos;encaissement</CardTitle>
          <CardDescription>Reste à payer des factures émises, regroupé par date d&apos;échéance.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div><p className="text-xs uppercase text-muted-foreground">30 jours</p><p className="text-xl font-bold">{formatEuro(snapshot.cashForecast.days30Cents)}</p></div>
          <div><p className="text-xs uppercase text-muted-foreground">60 jours</p><p className="text-xl font-bold">{formatEuro(snapshot.cashForecast.days60Cents)}</p></div>
          <div><p className="text-xs uppercase text-muted-foreground">90 jours</p><p className="text-xl font-bold">{formatEuro(snapshot.cashForecast.days90Cents)}</p></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Rentabilité par projet</CardTitle>
          <CardDescription>Facturation HT, dépenses liées et taux horaire effectif sur l&apos;année.</CardDescription>
        </CardHeader>
        <CardContent>
          {snapshot.projectProfitability.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">Aucune donnée projet exploitable.</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>Projet</TableHead><TableHead>Client</TableHead><TableHead>Temps</TableHead><TableHead>Taux effectif</TableHead><TableHead className="text-right">Marge directe</TableHead></TableRow></TableHeader>
              <TableBody>{snapshot.projectProfitability.map((project) => (
                <TableRow key={project.id}>
                  <TableCell><Link className="font-medium hover:underline" href={`/dashboard/projets/${project.id}`}>{project.name}</Link></TableCell>
                  <TableCell>{project.clientName}</TableCell>
                  <TableCell>{Math.round(project.totalSeconds / 360) / 10} h</TableCell>
                  <TableCell>{formatEuro(project.effectiveHourlyRateCents)}/h</TableCell>
                  <TableCell className={project.marginCents >= 0 ? "text-right font-bold text-success" : "text-right font-bold text-danger"}>{formatEuro(project.marginCents)}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4" /> CA ce mois</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatEuro(snapshot.caMonthCents)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Marge directe indicative</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatEuro(snapshot.directMarginCents)}</p><p className="mt-1 text-xs text-muted-foreground">Facturé HT − dépenses HT enregistrées</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Livre de recettes — Factures encaissées ({snapshot.recentPaid.length})
          </CardTitle>
          <CardDescription>20 dernières factures payées, prêtes pour le suivi comptable.</CardDescription>
        </CardHeader>
        <CardContent>
          {snapshot.recentPaid.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Aucune facture encaissée pour l'instant.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>N° facture</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">Montant TTC</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {snapshot.recentPaid.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="text-xs text-muted-foreground uppercase">{formatDate(inv.date)}</TableCell>
                    <TableCell>
                      <Link href={`/dashboard/factures/${inv.id}`} className="font-mono text-xs font-bold hover:underline">
                        {inv.number}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/dashboard/clients/${inv.client.id}`} className="text-sm hover:underline">
                        {inv.client.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right font-bold">{formatEuro(inv.totalTtcCents)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="p-4 rounded-lg bg-muted/20 border-l-4 border-primary text-xs text-muted-foreground">
        <p className="font-bold text-primary mb-1 uppercase tracking-widest">Périmètre comptable</p>
        L’archive téléchargée est un export précomptable équilibré accompagné de ses empreintes. Elle ne constitue pas un FEC réglementaire ni une comptabilité générale certifiée et doit être validée par le cabinet comptable avant import ou déclaration.
      </div>
    </div>
  )
}
