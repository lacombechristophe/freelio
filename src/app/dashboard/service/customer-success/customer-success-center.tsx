"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { AlertTriangle, CalendarClock, CheckCircle2, Gauge, Loader2, Plus, RefreshCw, Save, ShieldCheck, Trash2, UsersRound } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import {
  archiveCustomerHealthRule,
  createCustomerHealthRule,
  installDefaultCustomerHealthRules,
  recomputeCustomerHealth,
  updateClientSuccessProfile,
} from "@/actions/customer-success"
import { useConfirm } from "@/components/shared/confirm-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { HelpTip } from "@/components/ui/help-tip"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Textarea } from "@/components/ui/textarea"
import { customerHealthMetricDefinitions, type CustomerHealthMetric } from "@/lib/operations/customer-health"

type Workspace = Awaited<ReturnType<typeof import("@/actions/customer-success").getCustomerSuccessWorkspace>>
type PortfolioClient = Workspace["portfolio"][number]

const controlClass = "h-10 w-full rounded-[10px] border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/20"
const statusLabels: Record<string, string> = { HEALTHY: "Sain", WATCH: "À surveiller", RISK: "À risque" }
const operatorLabels: Record<string, string> = { GTE: "supérieur ou égal à", GT: "supérieur à", LTE: "inférieur ou égal à", LT: "inférieur à", EQ: "égal à" }

function date(value: Date | string | null) {
  if (!value) return "Non planifié"
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(value))
}

function dateInput(value: Date | string | null) {
  if (!value) return ""
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10)
}

function money(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(cents / 100)
}

function metricValue(metric: CustomerHealthMetric, value: number | null) {
  if (value === null) return "Non disponible"
  if (metric === "OVERDUE_BALANCE_CENTS") return money(value)
  if (metric === "SATISFACTION_PERCENT") return `${value}%`
  return `${value} ${customerHealthMetricDefinitions[metric].unit}`
}

function statusVariant(status: string) {
  return status === "RISK" ? "destructive" as const : status === "HEALTHY" ? "secondary" as const : "outline" as const
}

function ClientCard({ client, members, pending, run }: { client: PortfolioClient; members: Workspace["members"]; pending: boolean; run: (task: () => Promise<unknown>, success: string) => void }) {
  const trend = client.previousScore === null ? null : client.score - client.previousScore
  return <details className="group rounded-xl border bg-card">
    <summary className="grid cursor-pointer list-none gap-4 p-4 transition hover:bg-muted/20 lg:grid-cols-[minmax(220px,1.2fr)_100px_1fr_180px] lg:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/dashboard/clients/${client.id}`} onClick={(event) => event.stopPropagation()} className="truncate text-sm font-semibold hover:text-primary hover:underline">{client.name}</Link>
          <Badge variant={statusVariant(client.status)}>{statusLabels[client.status]}</Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{client.owner?.name || "Responsable non affecté"}</p>
      </div>
      <div>
        <div className="flex items-baseline gap-1"><span className="text-2xl font-semibold tabular-nums">{client.score}</span><span className="text-xs text-muted-foreground">/100</span></div>
        {trend !== null && trend !== 0 && <p className={`text-[11px] font-medium ${trend > 0 ? "text-success" : "text-destructive"}`}>{trend > 0 ? "+" : ""}{trend} depuis le dernier relevé</p>}
      </div>
      <div>
        <Progress value={client.score} className="h-1.5" />
        <p className="mt-2 line-clamp-1 text-xs text-muted-foreground">{client.factors[0]?.name || "Aucun signal de risque actif"}</p>
      </div>
      <div className="text-xs">
        <p className="font-medium">{client.nextActionLabel || "Prochaine action à définir"}</p>
        <p className="mt-1 text-muted-foreground">{date(client.nextActionAt)}</p>
      </div>
    </summary>
    <div className="grid gap-5 border-t bg-muted/10 p-4 xl:grid-cols-[0.9fr_1.1fr]">
      <div className="space-y-4">
        <div className="rounded-xl border bg-background p-4">
          <h3 className="text-sm font-semibold">Signaux calculés</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {(Object.entries(client.metrics) as [CustomerHealthMetric, number | null][]).map(([key, value]) => <div key={key} className="rounded-lg border p-3">
              <p className="text-[11px] font-medium text-muted-foreground">{customerHealthMetricDefinitions[key].label}</p>
              <p className="mt-1 text-sm font-semibold tabular-nums">{metricValue(key, value)}</p>
            </div>)}
          </div>
        </div>
        <div className="rounded-xl border bg-background p-4">
          <h3 className="text-sm font-semibold">Alertes actives</h3>
          {client.factors.length ? <div className="mt-3 space-y-2">{client.factors.map((factor) => <div key={factor.ruleId} className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-3">
            <AlertTriangle className="mt-0.5 size-4 text-destructive" />
            <div className="min-w-0 flex-1"><p className="text-xs font-semibold">{factor.name}</p><p className="mt-1 text-[11px] text-muted-foreground">{metricValue(factor.metric, factor.value)} · impact {factor.impact > 0 ? "+" : ""}{factor.impact}</p></div>
          </div>)}</div> : <p className="mt-3 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">Aucun seuil de risque déclenché.</p>}
        </div>
      </div>
      <form key={[client.owner?.id, dateInput(client.renewalAt), client.renewalAmountCents, dateInput(client.nextActionAt), client.nextActionLabel, client.successPlan, client.expansionNotes].join("|")} className="space-y-4 rounded-xl border bg-background p-4" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); run(() => updateClientSuccessProfile({ clientId: client.id, successOwnerMembershipId: data.get("successOwnerMembershipId"), renewalAt: data.get("renewalAt"), renewalAmountEuros: data.get("renewalAmountEuros"), nextActionAt: data.get("nextActionAt"), nextActionLabel: data.get("nextActionLabel"), successPlan: data.get("successPlan"), expansionNotes: data.get("expansionNotes") }), "Suivi client enregistré.") }}>
        <div><h3 className="text-sm font-semibold">Plan de suivi</h3><p className="mt-1 text-xs text-muted-foreground">Un score n’est utile que s’il mène à un responsable et une prochaine action.</p></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Responsable"><select aria-label="Responsable du portefeuille" name="successOwnerMembershipId" defaultValue={client.owner?.id || ""} className={controlClass}><option value="">Non affecté</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></Field>
          <Field label="Renouvellement"><Input aria-label="Date de renouvellement" name="renewalAt" type="date" defaultValue={dateInput(client.renewalAt)} /></Field>
          <Field label="Montant du renouvellement"><Input aria-label="Montant du renouvellement" name="renewalAmountEuros" type="number" min="0" step="0.01" defaultValue={(client.renewalAmountCents / 100).toFixed(2)} /></Field>
          <Field label="Date de prochaine action"><Input aria-label="Date de prochaine action" name="nextActionAt" type="date" defaultValue={dateInput(client.nextActionAt)} /></Field>
        </div>
        <Field label="Prochaine action"><Input aria-label="Prochaine action du portefeuille" name="nextActionLabel" maxLength={500} defaultValue={client.nextActionLabel || ""} placeholder="Appeler pour préparer le renouvellement" /></Field>
        <Field label="Plan de succès"><Textarea aria-label="Plan de succès" name="successPlan" maxLength={10_000} rows={4} defaultValue={client.successPlan || ""} placeholder="Objectifs client, résultats attendus, jalons et responsabilités…" /></Field>
        <Field label="Opportunités d’extension"><Textarea aria-label="Opportunités d’extension" name="expansionNotes" maxLength={5_000} rows={3} defaultValue={client.expansionNotes || ""} placeholder="Équipements complémentaires, nouveau site, contrat supérieur…" /></Field>
        <Button type="submit" disabled={pending}><Save />Enregistrer le suivi</Button>
      </form>
    </div>
  </details>
}

export function CustomerSuccessCenter({ initialData }: { initialData: Workspace }) {
  const router = useRouter()
  const confirm = useConfirm()
  const [pending, startTransition] = useTransition()
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState("ALL")
  const filtered = useMemo(() => initialData.portfolio.filter((client) => {
    const matchesQuery = !query.trim() || client.name.toLocaleLowerCase("fr-FR").includes(query.trim().toLocaleLowerCase("fr-FR"))
    return matchesQuery && (status === "ALL" || client.status === status)
  }), [initialData.portfolio, query, status])
  const run = (task: () => Promise<unknown>, success: string, reset?: HTMLFormElement) => startTransition(() => void task().then(() => { reset?.reset(); toast.success(success); router.refresh() }).catch((error) => toast.error(error instanceof Error ? error.message : "Action impossible.")))

  return <div className="space-y-6">
    <section className="grid overflow-hidden rounded-xl border bg-card sm:grid-cols-2 xl:grid-cols-4">
      <Metric icon={CheckCircle2} label="Clients sains" value={initialData.metrics.healthy} detail="Score supérieur ou égal à 75" />
      <Metric icon={Gauge} label="À surveiller" value={initialData.metrics.watch} detail="Score entre 50 et 74" />
      <Metric icon={AlertTriangle} label="À risque" value={initialData.metrics.risk} detail="Score inférieur à 50" alert={initialData.metrics.risk > 0} />
      <Metric icon={CalendarClock} label="Renouvellements" value={initialData.metrics.renewals90Days} detail="Dans les 90 prochains jours" />
    </section>

    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 lg:flex-row lg:items-center">
      <div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">Portefeuille priorisé</h2><p className="mt-1 text-xs text-muted-foreground">Les scores affichés sont recalculés en direct ; l’action « Figer les scores » crée l’historique de tendance.</p></div>
      <div className="flex flex-wrap gap-2">
        {initialData.rules.length === 0 && <Button type="button" variant="outline" disabled={pending} onClick={() => run(installDefaultCustomerHealthRules, "Règles de départ installées.")}><ShieldCheck />Installer les règles recommandées</Button>}
        <Button type="button" disabled={pending} onClick={() => run(recomputeCustomerHealth, "Scores recalculés et historisés.")}>{pending ? <Loader2 className="animate-spin" /> : <RefreshCw />}Figer les scores</Button>
      </div>
    </div>

    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.55fr)]">
      <section className="space-y-4">
        <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[1fr_200px]">
          <Input aria-label="Rechercher un client du portefeuille" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un client…" />
          <select aria-label="Filtrer par santé" value={status} onChange={(event) => setStatus(event.target.value)} className={controlClass}><option value="ALL">Tous les niveaux</option><option value="RISK">À risque</option><option value="WATCH">À surveiller</option><option value="HEALTHY">Sains</option></select>
        </div>
        {filtered.length ? filtered.map((client) => <ClientCard key={client.id} client={client} members={initialData.members} pending={pending} run={run} />) : <p className="rounded-xl border border-dashed bg-card py-12 text-center text-sm text-muted-foreground">Aucun client ne correspond à ces filtres.</p>}
      </section>

      <aside className="space-y-5">
        <Card>
          <CardHeader><div className="flex items-center gap-2"><CardTitle className="text-base">Nouvelle règle de santé</CardTitle><HelpTip label="Calcul transparent">Chaque règle compare une mesure à un seuil et ajoute ou retire des points à une base de 100. Les facteurs déclenchés sont visibles client par client.</HelpTip></div><CardDescription>Commencez par des signaux mesurables et actionnables.</CardDescription></CardHeader>
          <CardContent><form className="space-y-4" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); run(() => createCustomerHealthRule({ name: data.get("name"), metric: data.get("metric"), operator: data.get("operator"), threshold: data.get("threshold"), impact: data.get("impact"), priority: data.get("priority") }), "Règle de santé créée.", event.currentTarget) }}>
            <Field label="Nom"><Input aria-label="Nom de la règle" name="name" required minLength={2} maxLength={120} placeholder="Plus de deux tickets en retard" /></Field>
            <Field label="Mesure"><select aria-label="Mesure de santé" name="metric" className={controlClass}>{Object.entries(customerHealthMetricDefinitions).map(([value, definition]) => <option key={value} value={value}>{definition.label}</option>)}</select></Field>
            <div className="grid grid-cols-2 gap-3"><Field label="Comparaison"><select aria-label="Comparaison de la règle" name="operator" defaultValue="GTE" className={controlClass}>{Object.entries(operatorLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="Seuil"><Input aria-label="Seuil de la règle" name="threshold" type="number" step="0.01" required defaultValue="1" /></Field></div>
            <div className="grid grid-cols-2 gap-3"><Field label="Impact"><Input aria-label="Impact de la règle" name="impact" type="number" min="-100" max="100" required defaultValue="-15" /></Field><Field label="Priorité"><Input aria-label="Priorité de la règle" name="priority" type="number" min="0" max="100" defaultValue="50" /></Field></div>
            <Button type="submit" disabled={pending}><Plus />Créer la règle</Button>
          </form></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Règles actives</CardTitle><CardDescription>{initialData.rules.length} règle(s) appliquée(s) au portefeuille.</CardDescription></CardHeader>
          <CardContent>{initialData.rules.length ? <div className="space-y-2">{initialData.rules.map((rule) => <div key={rule.id} className="rounded-lg border p-3">
            <div className="flex items-start gap-2"><div className="min-w-0 flex-1"><p className="text-xs font-semibold">{rule.name}</p><p className="mt-1 text-[11px] leading-5 text-muted-foreground">{customerHealthMetricDefinitions[rule.metric as CustomerHealthMetric]?.label || rule.metric} {operatorLabels[rule.operator] || rule.operator} {rule.metric === "OVERDUE_BALANCE_CENTS" ? money(rule.threshold) : rule.threshold} · impact {rule.impact > 0 ? "+" : ""}{rule.impact}</p></div><Button type="button" size="icon-xs" variant="ghost" aria-label={`Archiver ${rule.name}`} disabled={pending} onClick={() => void confirm({ title: `Archiver « ${rule.name} » ?`, description: "Elle ne participera plus aux prochains calculs. L’historique des scores reste conservé.", confirmLabel: "Archiver", destructive: true }).then((accepted) => { if (accepted) run(() => archiveCustomerHealthRule(rule.id), "Règle archivée.") })}><Trash2 /></Button></div>
          </div>)}</div> : <p className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground">Sans règle active, tous les clients restent à 100. Installez le socle recommandé ou créez vos propres seuils.</p>}</CardContent>
        </Card>
      </aside>
    </div>
  </div>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1.5"><Label>{label}</Label>{children}</div> }
function Metric({ icon: Icon, label, value, detail, alert = false }: { icon: typeof UsersRound; label: string; value: number; detail: string; alert?: boolean }) { return <div className="border-t p-5 first:border-t-0 sm:border-l sm:border-t-0 sm:first:border-l-0"><div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Icon className={`size-4 ${alert ? "text-destructive" : "text-primary"}`} />{label}</div><p className={`mt-2 text-2xl font-semibold tabular-nums ${alert ? "text-destructive" : ""}`}>{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div> }
