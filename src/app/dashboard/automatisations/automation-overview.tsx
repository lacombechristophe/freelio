"use client"

import Link from "next/link"
import { AlertTriangle, ArrowRight, Bot, CheckCircle2, CircleDashed, Clock3, Mail, PhoneCall, Play, Send, Users, Workflow } from "lucide-react"

import { processSequenceEmailsNow } from "@/actions/automations"
import type { AutomationData, AutomationRunner } from "@/app/dashboard/automatisations/automation-model"
import { formatAutomationDate, STATUS_LABELS, STEP_LABELS, TRIGGER_LABELS } from "@/app/dashboard/automatisations/automation-model"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type ReadinessItem = {
  label: string
  ready: boolean
  detail: string
  actionLabel: string
  href?: string
  tab?: string
  onAction?: () => void
}

export function AutomationOverview({ data, pending, run, onNavigate }: { data: AutomationData; pending: boolean; run: AutomationRunner; onNavigate: (tab: string) => void }) {
  const deliveryCounts = data.stats.deliveries
  const sent = ["SENT", "DELIVERED", "OPENED", "CLICKED"].reduce((sum, status) => sum + (deliveryCounts[status] ?? 0), 0)
  const delivered = ["DELIVERED", "OPENED", "CLICKED"].reduce((sum, status) => sum + (deliveryCounts[status] ?? 0), 0)
  const opened = ["OPENED", "CLICKED"].reduce((sum, status) => sum + (deliveryCounts[status] ?? 0), 0)
  const failures = ["FAILED", "BOUNCED", "COMPLAINED", "SUPPRESSED"].reduce((sum, status) => sum + (deliveryCounts[status] ?? 0), 0)
  const activeSequences = data.sequences.filter((item) => item.status === "ACTIVE").length
  const activeWorkflows = data.workflows.filter((item) => item.status === "ACTIVE").length
  const activeEnrollments = data.sequences.reduce((sum, sequence) => sum + sequence.enrollments.filter((item) => item.status === "ACTIVE").length, 0)
  const readiness: ReadinessItem[] = [
    { label: "Fournisseur d’e-mail", ready: data.readiness.emailProviderConfigured && data.readiness.channel?.status === "ACTIVE", detail: data.readiness.channel?.emailAddress || "Aucune messagerie d’envoi active", actionLabel: "Configurer", href: "/dashboard/communications?tab=integrations" },
    { label: "Traitement automatique", ready: data.readiness.processorConfigured, detail: data.readiness.processorConfigured ? "Traitement planifié protégé et disponible" : "Le traitement peut être testé manuellement avant configuration du cron", actionLabel: "Tester", onAction: () => run(async () => processSequenceEmailsNow(), "Test du moteur terminé.") },
    { label: "Contenu prêt", ready: data.templates.length > 0 && data.sequences.some((item) => item.steps.length > 0), detail: `${data.templates.length} modèle(s), ${data.sequences.reduce((sum, item) => sum + item.steps.length, 0)} étape(s) configurée(s)`, actionLabel: data.templates.length ? "Séquences" : "Créer un modèle", tab: data.templates.length ? "sequences" : "templates" },
    { label: "Règles publiées", ready: activeWorkflows > 0, detail: activeWorkflows ? `${activeWorkflows} règle(s) active(s)` : "Aucune règle active", actionLabel: "Workflows", tab: "workflows" },
  ]
  const readinessReadyCount = readiness.filter((item) => item.ready).length

  return <div className="workspace-page">
    <section aria-label="Indicateurs des automatisations" className="workspace-metrics grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Stat label="Séquences actives" value={activeSequences} detail={`${activeEnrollments} inscription(s) en cours`} icon={Send} tone="blue" />
      <Stat label="Règles actives" value={activeWorkflows} detail={`${data.stats.runs.COMPLETED ?? 0} exécution(s) réussie(s)`} icon={Workflow} tone="teal" />
      <Stat label="E-mails envoyés" value={sent} detail="30 derniers jours" icon={Mail} tone="blue" />
      <Stat label="Taux d’ouverture" value={delivered ? `${Math.round(opened / delivered * 100)} %` : "—"} detail={`${opened} ouverture(s) mesurée(s)`} icon={Bot} tone="amber" />
      <Stat label="Incidents d’envoi" value={failures} detail={failures ? "À examiner dans le journal" : "Aucun incident récent"} icon={failures ? AlertTriangle : CheckCircle2} tone={failures ? "red" : "teal"} />
    </section>

    {data.sequences.length > 0 && <Card className="workspace-panel">
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle>Parcours en production</CardTitle><CardDescription>Une lecture immédiate des étapes, délais et inscriptions de vos séquences prioritaires.</CardDescription></div><Button variant="outline" size="sm" onClick={() => onNavigate("sequences")}><Send />Ouvrir le studio</Button></div>
      </CardHeader>
      <CardContent className="grid gap-0 p-0 lg:grid-cols-2 lg:divide-x lg:divide-border/80">
        {data.sequences.slice(0, 2).map((sequence) => {
          const sequenceActiveEnrollments = sequence.enrollments.filter((item) => item.status === "ACTIVE").length
          return <button type="button" key={sequence.id} onClick={() => onNavigate("sequences")} className="group p-4 text-left transition-colors hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/20">
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{sequence.name}</p><p className="mt-1 text-xs text-muted-foreground">{sequence.steps.length} étape(s) · {sequenceActiveEnrollments} inscription(s) active(s)</p></div><Badge variant={sequence.status === "ACTIVE" ? "default" : "outline"}>{STATUS_LABELS[sequence.status] ?? sequence.status}</Badge></div>
            <div className="mt-4 flex min-w-0 items-center gap-1.5 overflow-hidden" aria-label={`Étapes de ${sequence.name}`}>
              {sequence.steps.slice(0, 4).map((step, index) => {
                const StepIcon = step.type === "EMAIL" || step.type === "MANUAL_EMAIL" ? Mail : step.type === "CALL_TASK" ? PhoneCall : CheckCircle2
                return <div key={step.id} className="contents"><span className="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-muted/50 px-2.5 py-2"><span className="grid size-6 shrink-0 place-items-center rounded-md bg-primary/9 text-primary"><StepIcon className="size-3.5" /></span><span className="min-w-0"><span className="block truncate text-xs font-semibold">{STEP_LABELS[step.type] ?? step.type}</span><span className="block truncate text-[11px] text-muted-foreground">{step.delayHours ? `+ ${step.delayHours} h` : "Immédiat"}</span></span></span>{index < Math.min(sequence.steps.length, 4) - 1 && <ArrowRight className="size-3.5 shrink-0 text-muted-foreground/60" />}</div>
              })}
              {!sequence.steps.length && <span className="w-full rounded-lg border border-dashed px-3 py-3 text-center text-xs text-muted-foreground">Aucune étape configurée</span>}
            </div>
          </button>
        })}
      </CardContent>
    </Card>}

    <div className="grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
      <Card className="workspace-panel">
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

      <Card className="workspace-panel">
        <CardHeader className="border-b"><div className="flex items-start justify-between gap-3"><div><CardTitle className="text-base">Mise en service</CardTitle><CardDescription>Les quatre contrôles à valider avant de laisser le moteur travailler seul.</CardDescription></div><Badge variant={readinessReadyCount === readiness.length ? "default" : "secondary"}>{readinessReadyCount}/{readiness.length} prêts</Badge></div></CardHeader>
        <CardContent className="space-y-1">
          {readiness.map((item) => <div key={item.label} className="flex items-center gap-3 border-b py-3 last:border-b-0"><span className={`grid size-6 shrink-0 place-items-center rounded-full ${item.ready ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" : "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"}`}>{item.ready ? <CheckCircle2 className="size-3.5" /> : <Clock3 className="size-3.5" />}</span><div className="min-w-0 flex-1"><p className="text-sm font-medium">{item.label}</p><p className="mt-0.5 text-xs leading-5 text-muted-foreground">{item.detail}</p></div>{item.href ? <Link href={item.href} className={buttonVariants({ variant: item.ready ? "ghost" : "outline", size: "sm" })}>{item.actionLabel}<ArrowRight /></Link> : <Button type="button" variant={item.ready ? "ghost" : "outline"} size="sm" disabled={pending} onClick={item.onAction ?? (() => item.tab && onNavigate(item.tab))}>{item.actionLabel}<ArrowRight /></Button>}</div>)}
          {data.readiness.channel?.lastError && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs leading-5 text-destructive">{data.readiness.channel.lastError}</p>}
        </CardContent>
      </Card>
    </div>

    <Card className="workspace-panel">
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

    {data.workflows.length > 0 && <Card className="workspace-panel"><CardHeader><CardTitle className="text-base">Règles surveillées</CardTitle><CardDescription>État de publication et dernier résultat connu.</CardDescription></CardHeader><CardContent className="divide-y p-0">{data.workflows.slice(0, 6).map((workflow) => <button type="button" key={workflow.id} onClick={() => onNavigate("workflows")} className="flex w-full min-w-0 items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted"><Workflow className="size-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{workflow.name}</span><span className="block truncate text-xs text-muted-foreground">{TRIGGER_LABELS[workflow.trigger] ?? workflow.trigger}</span></span><Badge variant={workflow.status === "ACTIVE" ? "default" : "outline"}>{STATUS_LABELS[workflow.status] ?? workflow.status}</Badge></button>)}</CardContent></Card>}
  </div>
}

function Stat({ label, value, detail, icon: Icon, tone }: { label: string; value: number | string; detail: string; icon: typeof Mail; tone: "blue" | "teal" | "amber" | "red" }) {
  const iconTone = { blue: "bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300", teal: "bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300", amber: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300", red: "bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-300" }[tone]
  return <article className="workspace-metric flex min-w-0 items-center gap-3 rounded-xl border bg-card p-4" data-tone={tone}><span className={`relative z-10 grid size-9 shrink-0 place-items-center rounded-lg ${iconTone}`}><Icon className="size-4" /></span><div className="relative z-10 min-w-0"><p className="text-[25px] font-semibold leading-none tabular-nums tracking-tight">{value}</p><p className="mt-1 truncate text-[13px] font-medium">{label}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{detail}</p></div></article>
}
