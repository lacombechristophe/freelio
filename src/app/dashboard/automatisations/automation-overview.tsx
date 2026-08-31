"use client"

import { AlertTriangle, Bot, CheckCircle2, CircleDashed, Clock3, Mail, Play, Send, Users, Workflow } from "lucide-react"

import { processSequenceEmailsNow } from "@/actions/automations"
import type { AutomationData, AutomationRunner } from "@/app/dashboard/automatisations/automation-model"
import { formatAutomationDate, STATUS_LABELS, TRIGGER_LABELS } from "@/app/dashboard/automatisations/automation-model"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export function AutomationOverview({ data, pending, run, onNavigate }: { data: AutomationData; pending: boolean; run: AutomationRunner; onNavigate: (tab: string) => void }) {
  const deliveryCounts = data.stats.deliveries
  const sent = ["SENT", "DELIVERED", "OPENED", "CLICKED"].reduce((sum, status) => sum + (deliveryCounts[status] ?? 0), 0)
  const delivered = ["DELIVERED", "OPENED", "CLICKED"].reduce((sum, status) => sum + (deliveryCounts[status] ?? 0), 0)
  const opened = ["OPENED", "CLICKED"].reduce((sum, status) => sum + (deliveryCounts[status] ?? 0), 0)
  const failures = ["FAILED", "BOUNCED", "COMPLAINED", "SUPPRESSED"].reduce((sum, status) => sum + (deliveryCounts[status] ?? 0), 0)
  const activeSequences = data.sequences.filter((item) => item.status === "ACTIVE").length
  const activeWorkflows = data.workflows.filter((item) => item.status === "ACTIVE").length
  const activeEnrollments = data.sequences.reduce((sum, sequence) => sum + sequence.enrollments.filter((item) => item.status === "ACTIVE").length, 0)
  const readiness = [
    { label: "Fournisseur d’e-mail", ready: data.readiness.emailProviderConfigured && data.readiness.channel?.status === "ACTIVE", detail: data.readiness.channel?.emailAddress || "Canal Resend à activer" },
    { label: "Traitement automatique", ready: data.readiness.processorConfigured, detail: data.readiness.processorConfigured ? "Route cron protégée configurée" : "Secret de traitement à configurer" },
    { label: "Contenu prêt", ready: data.templates.length > 0 && data.sequences.some((item) => item.steps.length > 0), detail: `${data.templates.length} modèle(s), ${data.sequences.reduce((sum, item) => sum + item.steps.length, 0)} étape(s)` },
    { label: "Règles publiées", ready: activeWorkflows > 0, detail: activeWorkflows ? `${activeWorkflows} règle(s) active(s)` : "Aucune règle active" },
  ]

  return <div className="space-y-5">
    <section aria-label="Indicateurs des automatisations" className="overflow-hidden rounded-xl border bg-card">
      <div className="grid sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Séquences actives" value={activeSequences} detail={`${activeEnrollments} inscription(s) en cours`} icon={Send} />
        <Stat label="Règles actives" value={activeWorkflows} detail={`${data.stats.runs.COMPLETED ?? 0} exécution(s) réussie(s)`} icon={Workflow} />
        <Stat label="E-mails envoyés" value={sent} detail="30 derniers jours" icon={Mail} />
        <Stat label="Taux d’ouverture" value={delivered ? `${Math.round(opened / delivered * 100)} %` : "—"} detail={`${opened} ouverture(s) mesurée(s)`} icon={Bot} />
        <Stat label="Incidents d’envoi" value={failures} detail={failures ? "À examiner dans le journal" : "Aucun incident récent"} icon={failures ? AlertTriangle : CheckCircle2} tone={failures ? "danger" : "success"} />
      </div>
    </section>

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><CardTitle className="text-base">Activité récente</CardTitle><CardDescription>Derniers envois et règles exécutées, avec les erreurs immédiatement visibles.</CardDescription></div>
            <Button variant="outline" size="sm" disabled={pending} onClick={() => run(async () => { const result = await processSequenceEmailsNow(); return result }, "Traitement des échéances terminé.")}><Play />Traiter maintenant</Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {data.deliveries.length ? <div className="divide-y">{data.deliveries.slice(0, 7).map((delivery) => <div key={delivery.id} className="flex min-w-0 items-center gap-3 px-5 py-3.5">
            <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${["FAILED", "BOUNCED", "COMPLAINED", "SUPPRESSED"].includes(delivery.status) ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}><Mail className="size-4" /></span>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{delivery.subject}</p><p className="truncate text-xs text-muted-foreground">{delivery.recipientEmail} · {delivery.sequence?.name || "Envoi direct"}</p></div>
            <div className="shrink-0 text-right"><Badge variant={delivery.status === "FAILED" ? "destructive" : "outline"}>{STATUS_LABELS[delivery.status] ?? delivery.status}</Badge><p className="mt-1 text-[11px] text-muted-foreground">{formatAutomationDate(delivery.sentAt || delivery.createdAt)}</p></div>
          </div>)}</div> : <div className="px-6 py-12 text-center"><CircleDashed className="mx-auto size-7 text-muted-foreground" /><p className="mt-3 text-sm font-medium">Aucune activité d’envoi</p><p className="mt-1 text-xs text-muted-foreground">Les premiers événements apparaîtront ici après une inscription.</p></div>}
          <div className="border-t bg-muted/20 px-5 py-3"><Button variant="link" className="h-auto p-0 text-xs" onClick={() => onNavigate("history")}>Ouvrir le journal complet</Button></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Mise en service</CardTitle><CardDescription>Les quatre contrôles à valider avant de laisser le moteur travailler seul.</CardDescription></CardHeader>
        <CardContent className="space-y-1">
          {readiness.map((item) => <div key={item.label} className="flex gap-3 border-b py-3 last:border-b-0"><span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full ${item.ready ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" : "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"}`}>{item.ready ? <CheckCircle2 className="size-3.5" /> : <Clock3 className="size-3.5" />}</span><div><p className="text-sm font-medium">{item.label}</p><p className="mt-0.5 text-xs leading-5 text-muted-foreground">{item.detail}</p></div></div>)}
          {data.readiness.channel?.lastError && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs leading-5 text-destructive">{data.readiness.channel.lastError}</p>}
        </CardContent>
      </Card>
    </div>

    <Card>
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><CardTitle className="text-base">Audience exploitable</CardTitle><CardDescription>Prospects récents avec adresse e-mail et consentement marketing actif.</CardDescription></div>
          <div className="flex items-center gap-2"><Badge variant="secondary">{data.leads.length} éligible(s)</Badge><Button variant="outline" size="sm" onClick={() => onNavigate("sequences")}><Users />Gérer les inscriptions</Button></div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {data.leads.length ? <div className="grid md:grid-cols-2">{data.leads.slice(0, 8).map((lead) => <div key={lead.id} className="flex min-w-0 items-center gap-3 border-b px-5 py-3.5 md:odd:border-r"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">{lead.firstName.slice(0, 1)}{lead.lastName.slice(0, 1)}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{lead.firstName} {lead.lastName}</p><p className="truncate text-xs text-muted-foreground">{lead.email} · {lead.city || lead.source}</p></div>{lead.projectType && <Badge variant="outline" className="hidden max-w-44 truncate lg:inline-flex">{lead.projectType}</Badge>}</div>)}</div> : <div className="px-6 py-10 text-center"><Users className="mx-auto size-7 text-muted-foreground" /><p className="mt-3 text-sm font-medium">Aucun prospect éligible</p><p className="mt-1 text-xs text-muted-foreground">Les contacts consentants apparaîtront ici dès leur capture.</p></div>}
      </CardContent>
    </Card>

    {data.workflows.length > 0 && <Card><CardHeader><CardTitle className="text-base">Règles surveillées</CardTitle><CardDescription>État de publication et dernier résultat connu.</CardDescription></CardHeader><CardContent className="grid gap-x-6 gap-y-3 md:grid-cols-2">{data.workflows.slice(0, 6).map((workflow) => <button type="button" key={workflow.id} onClick={() => onNavigate("workflows")} className="flex min-w-0 items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted"><Workflow className="size-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{workflow.name}</span><span className="block truncate text-xs text-muted-foreground">{TRIGGER_LABELS[workflow.trigger] ?? workflow.trigger}</span></span><Badge variant={workflow.status === "ACTIVE" ? "default" : "outline"}>{STATUS_LABELS[workflow.status] ?? workflow.status}</Badge></button>)}</CardContent></Card>}
  </div>
}

function Stat({ label, value, detail, icon: Icon, tone = "default" }: { label: string; value: number | string; detail: string; icon: typeof Mail; tone?: "default" | "danger" | "success" }) {
  const iconTone = tone === "danger" ? "bg-destructive/10 text-destructive" : tone === "success" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" : "bg-primary/10 text-primary"
  return <div className="flex min-w-0 items-center gap-3 border-b p-4 last:border-b-0 sm:[&:nth-child(odd)]:border-r sm:[&:nth-child(4)]:border-r-0 xl:border-b-0 xl:border-r xl:last:border-r-0 xl:[&:nth-child(odd)]:border-r"><span className={`grid size-9 shrink-0 place-items-center rounded-lg ${iconTone}`}><Icon className="size-4" /></span><div className="min-w-0"><p className="text-lg font-semibold tabular-nums">{value}</p><p className="truncate text-xs font-medium">{label}</p><p className="truncate text-[11px] text-muted-foreground">{detail}</p></div></div>
}
