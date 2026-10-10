"use client"

import { useCallback, useEffect, useState, useTransition } from "react"
import { AlertTriangle, CheckCircle2, Clock3, Eye, Mail, Play, RotateCcw, Search, ShieldBan, Workflow } from "lucide-react"

import { getAutomationDeliveryJournal, getAutomationDeliveryDetails, getAutomationSuppressions, processSequenceEmailsNow, reactivateEmailAddress, retryEmailDelivery } from "@/actions/automations"
import type { AutomationData, AutomationRunner } from "@/app/dashboard/automatisations/automation-model"
import { controlClass, formatAutomationDate, STATUS_LABELS } from "@/app/dashboard/automatisations/automation-model"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { WorkflowRunJournal } from "./workflow-run-journal"
import { JournalSequencePicker } from "./journal-sequence-picker"
import { SequenceRecoveryPanel } from "./sequence-recovery-panel"
import { useStudioPage, StudioPagination } from "./studio-pagination"

const errorStatuses = new Set(["FAILED", "BOUNCED", "COMPLAINED", "SUPPRESSED", "DEAD_LETTER"])

export function DeliveryJournal({ data, pending, run }: { data: AutomationData; pending: boolean; run: AutomationRunner }) {
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState("ALL")
  const [sequence, setSequence] = useState("ALL")
  const [page, setPage] = useState(1)
  const [journal, setJournal] = useState(data.deliveryJournal)
  const [error, setError] = useState("")
  const [loading, startTransition] = useTransition()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Awaited<ReturnType<typeof getAutomationDeliveryDetails>>>(null)
  const [detailError, setDetailError] = useState("")
  const [suppressionToClear, setSuppressionToClear] = useState<AutomationData["suppressions"][number] | null>(null)
  const [suppressionSearch, setSuppressionSearch] = useState("")
  const blocked = useStudioPage(data.suppressions, data.studioTotals.suppressions, "", { search: suppressionSearch }, data.suppressions, getAutomationSuppressions)
  useEffect(() => {
    let active = true
    const timer = window.setTimeout(() => startTransition(async () => {
      try {
        const result = await getAutomationDeliveryJournal({ page, search: query, status, sequenceId: sequence === "ALL" ? undefined : sequence })
        if (active) { if (result) setJournal(result); setError(result ? "" : "Impossible de charger les e-mails") }
      } catch { if (active) setError("Impossible de charger les e-mails") }
    }), 250)
    return () => { active = false; window.clearTimeout(timer) }
  }, [page, query, status, sequence, data.deliveryJournal])
  useEffect(() => {
    if (!selectedId) return
    let active = true
    startTransition(async () => {
      try {
        const result = await getAutomationDeliveryDetails(selectedId)
        if (active) { setSelected(result); setDetailError(result ? "" : "Envoi inaccessible") }
      } catch { if (active) { setSelected(null); setDetailError("Impossible de charger le détail") } }
    })
    return () => { active = false }
  }, [selectedId, data.deliveryJournal])
  const deliveries = journal.rows
  const selectSequence = useCallback((id: string) => { setSequence(id); setPage(1) }, [])
  const [runCount, setRunCount] = useState<number | null>(null)

  const retrySelected = selected && !selected.recovery?.closedAt && ["FAILED", "DEAD_LETTER"].includes(selected.status)

  return <div className="space-y-4">
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 lg:flex-row lg:items-center"><div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} maxLength={200} onChange={(event) => { setQuery(event.target.value); setPage(1) }} className="pl-9" placeholder="Rechercher un objet ou un destinataire…" aria-label="Rechercher dans le journal" /></div><select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }} className={`${controlClass} lg:w-44`} aria-label="Filtrer par état"><option value="ALL">Tous les états</option><option value="SENT">Envoyés</option><option value="DELIVERED">Livrés</option><option value="OPENED">Ouverts</option><option value="CLICKED">Cliqués</option><option value="FAILED">Échecs</option><option value="DEAD_LETTER">À reprendre</option><option value="BOUNCED">Rejets</option><option value="COMPLAINED">Plaintes</option><option value="SUPPRESSED">Bloqués</option></select><JournalSequencePicker value={sequence} onChange={selectSequence} /><Button variant="outline" disabled={pending} onClick={() => run(async () => { const result = await processSequenceEmailsNow(); return result }, "Échéances traitées.")}><Play />Traiter les échéances</Button></div>

    <Tabs defaultValue="emails" className="space-y-4"><TabsList variant="line"><TabsTrigger value="emails"><Mail />E-mails <Badge variant="secondary">{journal.total}</Badge></TabsTrigger><TabsTrigger value="runs"><Workflow />Exécutions <Badge variant="secondary">{runCount ?? "…"}</Badge></TabsTrigger><TabsTrigger value="suppressions"><ShieldBan />Adresses bloquées <Badge variant="secondary">{blocked.result.total}</Badge></TabsTrigger></TabsList>
      <TabsContent value="emails">{error ? <p role="alert" className="text-sm">{error}</p> : null}<div className="overflow-hidden rounded-xl border bg-card"><div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(180px,0.8fr)_150px_120px_40px] gap-4 border-b bg-muted/35 px-4 py-3 text-xs font-semibold text-muted-foreground md:grid"><span>Objet / destinataire</span><span>Séquence</span><span>Date</span><span>État</span><span /></div>{deliveries.length ? <div className="divide-y">{deliveries.map((delivery) => <button type="button" key={delivery.id} data-email-delivery={delivery.id} onClick={() => { setSelected(null); setDetailError(""); setSelectedId(delivery.id) }} className="grid w-full gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:grid-cols-[minmax(0,1.4fr)_minmax(180px,0.8fr)_150px_120px_40px] md:items-center md:gap-4"><span className="min-w-0"><span className="block truncate text-sm font-medium">{delivery.subject}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{delivery.recipientEmail}</span></span><span className="truncate text-xs text-muted-foreground">{delivery.sequence?.name || "Envoi direct"}</span><time className="text-xs text-muted-foreground">{formatAutomationDate(delivery.sentAt || delivery.scheduledAt)}</time><Badge className="w-fit" variant={errorStatuses.has(delivery.status) ? "destructive" : ["DELIVERED", "OPENED", "CLICKED"].includes(delivery.status) ? "secondary" : "outline"}>{errorStatuses.has(delivery.status) ? <AlertTriangle /> : ["DELIVERED", "OPENED", "CLICKED"].includes(delivery.status) ? <CheckCircle2 /> : <Clock3 />}{STATUS_LABELS[delivery.status] ?? delivery.status}</Badge><Eye className="hidden size-4 text-muted-foreground md:block" /></button>)}</div> : <EmptyJournal icon={Mail} title="Aucun envoi" detail="Les filtres ne correspondent à aucun e-mail, ou aucune séquence n’a encore envoyé de message." />}</div><div className="mt-3 flex flex-wrap items-center gap-2 text-xs"><Button size="sm" variant="outline" aria-label="Page précédente : e-mails" disabled={loading || journal.page <= 1} onClick={() => setPage(journal.page - 1)}>Page précédente</Button><span>{journal.total} e-mail(s) · Page {journal.page} sur {journal.pageCount}</span><Button size="sm" variant="outline" aria-label="Page suivante : e-mails" disabled={loading || journal.page >= journal.pageCount} onClick={() => setPage(journal.page + 1)}>Page suivante</Button></div></TabsContent>
      <TabsContent value="runs"><WorkflowRunJournal onCount={setRunCount} /></TabsContent>
      <TabsContent value="suppressions"><Input aria-label="Rechercher une adresse bloquée" placeholder="Rechercher…" maxLength={200} value={suppressionSearch} onChange={event => { setSuppressionSearch(event.target.value); blocked.setPage(1) }} className="mb-3" />{blocked.error ? <p role="alert">{blocked.error}</p> : null}<div className="overflow-hidden rounded-xl border bg-card">{blocked.result.rows.length ? <div className="divide-y">{blocked.result.rows.map((suppression) => <div key={suppression.id} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-destructive/10 text-destructive"><ShieldBan className="size-4" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{suppression.email}</p><p className="mt-0.5 text-xs text-muted-foreground">{STATUS_LABELS[suppression.reason] ?? suppression.reason.replaceAll("_", " ")} · {formatAutomationDate(suppression.suppressedAt)}</p></div><Button variant="outline" size="sm" disabled={pending} onClick={() => setSuppressionToClear(suppression)}><RotateCcw />Examiner</Button></div>)}</div> : <EmptyJournal icon={ShieldBan} title="Aucune adresse bloquée" detail="Les rejets permanents, plaintes et suppressions fournisseur seront centralisés ici." />}</div><StudioPagination {...blocked.result} label="adresses bloquées" loading={blocked.loading} onPage={blocked.setPage} /></TabsContent>
    </Tabs>

    <Dialog open={Boolean(selectedId)} onOpenChange={(open) => { if (!open) { setSelectedId(null); setSelected(null); setDetailError("") } }}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>{selected?.subject || "Détail"}</DialogTitle><DialogDescription>{selected?.recipientEmail}</DialogDescription></DialogHeader>{detailError ? <p role="alert">{detailError}</p> : !selected ? <p role="status">Chargement du détail…</p> : null}{selected && <div className="space-y-4"><div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2"><Detail label="État" value={STATUS_LABELS[selected.status] ?? selected.status} /><Detail label="Séquence" value={selected.sequence?.name || "Envoi direct"} /><Detail label="Planifié" value={formatAutomationDate(selected.scheduledAt)} /><Detail label="Envoyé" value={formatAutomationDate(selected.sentAt)} /><Detail label="Tentatives" value={`${selected.attempts}/${selected.maxAttempts}`} /><Detail label="Prochaine reprise" value={formatAutomationDate(selected.nextAttemptAt)} /></div>{selected.error ? <div className="rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-sm leading-6 text-destructive"><strong className="block">Erreur fournisseur</strong>{selected.error}</div> : <div className="flex items-start gap-2 rounded-lg bg-emerald-50 p-3 text-sm leading-6 text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-100"><CheckCircle2 className="mt-0.5 size-4 shrink-0" />Aucune erreur enregistrée pour cet envoi.</div>}{selected.recovery ? <SequenceRecoveryPanel key={selected.id + selected.recovery.version} id={selected.id} state={selected.recovery} pending={pending} run={run} /> : null}{retrySelected ? <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/25 p-3"><p className="text-xs leading-5 text-muted-foreground">La reprise conserve l’identifiant fournisseur afin d’éviter un doublon après un incident.</p><Button size="sm" disabled={pending} onClick={() => run(() => retryEmailDelivery(selected.id), "Envoi remis en file.", { after: () => { setSelectedId(null); setSelected(null) } })}><RotateCcw />Réessayer</Button></div> : null}</div>}</DialogContent></Dialog>

    <Dialog open={Boolean(suppressionToClear)} onOpenChange={(open) => { if (!open) setSuppressionToClear(null) }}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>Réactiver cette adresse ?</DialogTitle><DialogDescription>{suppressionToClear?.email}</DialogDescription></DialogHeader><div className="space-y-4"><div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm leading-6"><strong className="block">Contrôle humain requis</strong>Confirmez que l’adresse est valide et, pour une plainte, que le destinataire a redonné un consentement explicite. Les séquences arrêtées ne redémarreront pas automatiquement.</div><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setSuppressionToClear(null)}>Annuler</Button><Button disabled={pending || !suppressionToClear} onClick={() => suppressionToClear && run(() => reactivateEmailAddress(suppressionToClear.id), "Adresse réactivée.", { after: () => setSuppressionToClear(null) })}><RotateCcw />Confirmer la réactivation</Button></div></div></DialogContent></Dialog>
  </div>
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[11px] font-medium text-muted-foreground">{label}</p><p className="mt-1 break-words text-sm font-medium">{value}</p></div>
}

function EmptyJournal({ icon: Icon, title, detail }: { icon: typeof Mail; title: string; detail: string }) {
  return <div className="px-5 py-14 text-center"><Icon className="mx-auto size-7 text-muted-foreground" /><p className="mt-3 text-sm font-medium">{title}</p><p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">{detail}</p></div>
}
