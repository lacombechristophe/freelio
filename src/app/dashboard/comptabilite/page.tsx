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
import { WorkspaceMetricCard } from "@/app/dashboard/_components/workspace-hub"

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
    <div className="workspace-page">
      <PageHeader
        eyebrow="Pilotage financier"
        title="Finance & comptabilité"
        description="Pilotez facturation, encaissements, encours, TVA et rentabilité, puis transmettez un export contrôlé au cabinet comptable."
        actions={<>
          <Button nativeButton={false} variant="outline" render={<a href="/api/accounting/export" />}><Download />Export comptable</Button>
          <Button nativeButton={false} variant="outline" render={<Link href="/dashboard/comptabilite/banque" />}><Landmark />Banque</Button>
          <Button nativeButton={false} variant="outline" render={<Link href="/dashboard/factures" />}><Receipt />Voir les factures</Button>
        </>}
      />

      <section aria-label="Synthèse comptable" className="workspace-metrics grid grid-cols-2 gap-3 xl:grid-cols-4">
        <WorkspaceMetricCard metric={{ label: `Facturé HT (${year})`, value: formatEuro(snapshot.caYearCents), detail: `${formatEuro(snapshot.billedYearTtcCents)} TTC, avoirs déduits`, icon: Receipt }} />
        <WorkspaceMetricCard metric={{ label: `Encaissé (${year})`, value: formatEuro(snapshot.paidYearCents), detail: "Règlements enregistrés sur la période", icon: CheckCircle2, tone: "teal" }} />
        <WorkspaceMetricCard metric={{ label: "Encours client", value: formatEuro(snapshot.outstandingCents), detail: `${snapshot.overdueCount} échéance(s) dépassée(s) · ${formatEuro(snapshot.overdueCents)}`, icon: AlertCircle, alert: snapshot.overdueCount > 0 }} />
        <WorkspaceMetricCard metric={{ label: "TVA indicative", value: snapshot.isTvaApplicable ? formatEuro(snapshot.tvaBalanceCents) : "Non applicable", detail: `Collectée ${formatEuro(snapshot.tvaCollectedCents)} · déductible ${formatEuro(snapshot.tvaDeductibleCents)}`, icon: Landmark }} />
      </section>

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

      <aside className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-xs leading-5 text-muted-foreground shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <AlertCircle className="size-4" />
        </span>
        <div>
          <p className="mb-1 font-semibold text-foreground">Périmètre comptable</p>
          L’archive téléchargée est un export précomptable équilibré accompagné de ses empreintes. Elle ne constitue pas un FEC réglementaire ni une comptabilité générale certifiée et doit être validée par le cabinet comptable avant import ou déclaration.
        </div>
      </aside>
    </div>
  )
}
