"use client"

import { useMemo, useState } from "react"
import { Activity, AlertTriangle, CheckCircle2, Clock3, Eye, Mail, Play, Search, Workflow } from "lucide-react"

import { processSequenceEmailsNow } from "@/actions/automations"
import type { AutomationData, AutomationDelivery, AutomationRunner } from "@/app/dashboard/automatisations/automation-model"
import { controlClass, formatAutomationDate, STATUS_LABELS, TRIGGER_LABELS } from "@/app/dashboard/automatisations/automation-model"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const errorStatuses = new Set(["FAILED", "BOUNCED", "COMPLAINED", "SUPPRESSED"])

export function DeliveryJournal({ data, pending, run }: { data: AutomationData; pending: boolean; run: AutomationRunner }) {
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState("ALL")
  const [sequence, setSequence] = useState("ALL")
  const [selected, setSelected] = useState<AutomationDelivery | null>(null)
  const deliveries = useMemo(() => data.deliveries.filter((delivery) => {
    const matchesText = `${delivery.subject} ${delivery.recipientEmail} ${delivery.sequence?.name || ""}`.toLocaleLowerCase("fr").includes(query.trim().toLocaleLowerCase("fr"))
    return matchesText && (status === "ALL" || delivery.status === status) && (sequence === "ALL" || delivery.sequence?.name === sequence)
  }), [data.deliveries, query, sequence, status])
  const runs = data.workflows.flatMap((workflow) => workflow.runs.map((item) => ({ ...item, workflowId: workflow.id, workflowName: workflow.name, trigger: workflow.trigger }))).sort((left, right) => right.startedAt.localeCompare(left.startedAt))
  const sequenceNames = [...new Set(data.deliveries.map((item) => item.sequence?.name).filter((value): value is string => Boolean(value)))]

  return <div className="space-y-4">
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 lg:flex-row lg:items-center"><div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Rechercher un objet ou un destinataire…" aria-label="Rechercher dans le journal" /></div><select value={status} onChange={(event) => setStatus(event.target.value)} className={`${controlClass} lg:w-44`} aria-label="Filtrer par état"><option value="ALL">Tous les états</option><option value="SENT">Envoyés</option><option value="DELIVERED">Livrés</option><option value="OPENED">Ouverts</option><option value="CLICKED">Cliqués</option><option value="FAILED">Échecs</option><option value="BOUNCED">Rejets</option></select><select value={sequence} onChange={(event) => setSequence(event.target.value)} className={`${controlClass} lg:w-52`} aria-label="Filtrer par séquence"><option value="ALL">Toutes les séquences</option>{sequenceNames.map((name) => <option key={name} value={name}>{name}</option>)}</select><Button variant="outline" disabled={pending} onClick={() => run(async () => { const result = await processSequenceEmailsNow(); return result }, "Échéances traitées.")}><Play />Traiter les échéances</Button></div>

    <Tabs defaultValue="emails" className="space-y-4"><TabsList variant="line"><TabsTrigger value="emails"><Mail />E-mails <Badge variant="secondary">{deliveries.length}</Badge></TabsTrigger><TabsTrigger value="runs"><Workflow />Exécutions <Badge variant="secondary">{runs.length}</Badge></TabsTrigger></TabsList>
      <TabsContent value="emails"><div className="overflow-hidden rounded-xl border bg-card"><div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(180px,0.8fr)_150px_120px_40px] gap-4 border-b bg-muted/35 px-4 py-3 text-xs font-semibold text-muted-foreground md:grid"><span>Objet / destinataire</span><span>Séquence</span><span>Date</span><span>État</span><span /></div>{deliveries.length ? <div className="divide-y">{deliveries.map((delivery) => <button type="button" key={delivery.id} onClick={() => setSelected(delivery)} className="grid w-full gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:grid-cols-[minmax(0,1.4fr)_minmax(180px,0.8fr)_150px_120px_40px] md:items-center md:gap-4"><span className="min-w-0"><span className="block truncate text-sm font-medium">{delivery.subject}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{delivery.recipientEmail}</span></span><span className="truncate text-xs text-muted-foreground">{delivery.sequence?.name || "Envoi direct"}</span><time className="text-xs text-muted-foreground">{formatAutomationDate(delivery.sentAt || delivery.scheduledAt)}</time><Badge className="w-fit" variant={errorStatuses.has(delivery.status) ? "destructive" : ["DELIVERED", "OPENED", "CLICKED"].includes(delivery.status) ? "secondary" : "outline"}>{errorStatuses.has(delivery.status) ? <AlertTriangle /> : ["DELIVERED", "OPENED", "CLICKED"].includes(delivery.status) ? <CheckCircle2 /> : <Clock3 />}{STATUS_LABELS[delivery.status] ?? delivery.status}</Badge><Eye className="hidden size-4 text-muted-foreground md:block" /></button>)}</div> : <EmptyJournal icon={Mail} title="Aucun envoi" detail="Les filtres ne correspondent à aucun e-mail, ou aucune séquence n’a encore envoyé de message." />}</div></TabsContent>
      <TabsContent value="runs"><div className="overflow-hidden rounded-xl border bg-card"><div className="hidden grid-cols-[minmax(0,1fr)_minmax(190px,0.7fr)_150px_120px] gap-4 border-b bg-muted/35 px-4 py-3 text-xs font-semibold text-muted-foreground md:grid"><span>Workflow</span><span>Événement</span><span>Date</span><span>Résultat</span></div>{runs.length ? <div className="divide-y">{runs.map((item) => <div key={item.id} className="grid gap-2 px-4 py-3.5 md:grid-cols-[minmax(0,1fr)_minmax(190px,0.7fr)_150px_120px] md:items-center md:gap-4"><span className="min-w-0"><span className="block truncate text-sm font-medium">{item.workflowName}</span><span className="block truncate text-xs text-muted-foreground">{TRIGGER_LABELS[item.trigger] ?? item.trigger}</span></span><span className="truncate text-xs text-muted-foreground">{item.event} · {item.subjectModel}</span><time className="text-xs text-muted-foreground">{formatAutomationDate(item.startedAt)}</time><Badge className="w-fit" variant={item.status === "FAILED" ? "destructive" : item.status === "COMPLETED" ? "secondary" : "outline"}>{STATUS_LABELS[item.status] ?? item.status}</Badge>{item.error && <p className="text-xs leading-5 text-destructive md:col-span-4">{item.error}</p>}</div>)}</div> : <EmptyJournal icon={Activity} title="Aucune exécution" detail="Les événements de workflow apparaîtront ici après activation d’une règle." />}</div></TabsContent>
    </Tabs>

    <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null) }}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>{selected?.subject}</DialogTitle><DialogDescription>{selected?.recipientEmail}</DialogDescription></DialogHeader>{selected && <div className="space-y-4"><div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2"><Detail label="État" value={STATUS_LABELS[selected.status] ?? selected.status} /><Detail label="Séquence" value={selected.sequence?.name || "Envoi direct"} /><Detail label="Planifié" value={formatAutomationDate(selected.scheduledAt)} /><Detail label="Envoyé" value={formatAutomationDate(selected.sentAt)} /></div>{selected.error ? <div className="rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-sm leading-6 text-destructive"><strong className="block">Erreur fournisseur</strong>{selected.error}</div> : <div className="flex items-start gap-2 rounded-lg bg-emerald-50 p-3 text-sm leading-6 text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-100"><CheckCircle2 className="mt-0.5 size-4 shrink-0" />Aucune erreur enregistrée pour cet envoi.</div>}</div>}</DialogContent></Dialog>
  </div>
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[11px] font-medium text-muted-foreground">{label}</p><p className="mt-1 break-words text-sm font-medium">{value}</p></div>
}

function EmptyJournal({ icon: Icon, title, detail }: { icon: typeof Mail; title: string; detail: string }) {
  return <div className="px-5 py-14 text-center"><Icon className="mx-auto size-7 text-muted-foreground" /><p className="mt-3 text-sm font-medium">{title}</p><p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">{detail}</p></div>
}
