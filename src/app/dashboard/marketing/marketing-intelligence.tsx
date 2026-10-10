"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Activity, Filter, Gauge, Plus, RefreshCw, Sparkles, Users } from "lucide-react"
import { toast } from "sonner"
import { createLeadScoringRule, createMarketingSegment, duplicateMarketingObject, getMarketingIntelligenceDashboard, getMarketingLeadPage, getSegmentMemberPage, previewMarketingSegment, refreshMarketingIntelligence, updateLeadScoringRule, updateMarketingObjectStatus, updateMarketingSegment, updateStaticSegmentMembers } from "@/actions/marketing"
import { useConfirm } from "@/components/shared/confirm-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { HelpTip } from "@/components/ui/help-tip"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { SegmentFilters } from "@/lib/marketing/intelligence"

type Dashboard = Awaited<ReturnType<typeof getMarketingIntelligenceDashboard>>
type Rule = Dashboard["rules"][number]
type Segment = Dashboard["segments"][number]
type LeadPage = Awaited<ReturnType<typeof getMarketingLeadPage>>
type MemberPage = Awaited<ReturnType<typeof getSegmentMemberPage>>
const controlClass = "h-10 w-full rounded-[10px] border border-input bg-background px-3 text-sm"
const fieldLabels: Record<string, string> = { status: "Statut", source: "Source", city: "Ville", projectType: "Type de projet", marketingOptIn: "Consentement marketing", email: "E-mail", phone: "Téléphone" }

function filtersFromForm(form: HTMLFormElement, previous: SegmentFilters = {}): SegmentFilters {
  const data = new FormData(form), filters = { ...previous }
  for (const [name, key] of [["status", "status"], ["source", "source"], ["city", "cityContains"], ["projectType", "projectTypeContains"]] as const) {
    const value = String(data.get(name) ?? "").trim()
    if (value) filters[key] = value
    else delete filters[key]
  }
  if (data.get("minScore") !== "") filters.minScore = Number(data.get("minScore"))
  else delete filters.minScore
  const consent = data.get("marketingOptIn")
  if (consent === "true" || consent === "false") filters.marketingOptIn = consent === "true"
  else delete filters.marketingOptIn
  return filters
}

export function MarketingIntelligence({ initialData }: { initialData: Dashboard }) {
  const router = useRouter(), confirm = useConfirm()
  const [pending, startTransition] = React.useTransition()
  const [editingRule, setEditingRule] = React.useState<Rule | null>(null)
  const [editingSegment, setEditingSegment] = React.useState<Segment | null>(null)
  const [duplicate, setDuplicate] = React.useState<{ id: string; kind: "RULE" | "SEGMENT"; name: string; updatedAt: Date } | null>(null)
  const [members, setMembers] = React.useState<Segment | null>(null)
  const [leadPage, setLeadPage] = React.useState<LeadPage | null>(null)
  const [preview, setPreview] = React.useState<Awaited<ReturnType<typeof previewMarketingSegment>> | null>(null)
  const [previewing, setPreviewing] = React.useState(false)
  const segmentForm = React.useRef<HTMLFormElement>(null), previewVersion = React.useRef(0)
  const leads = leadPage ?? { rows: initialData.leads, total: initialData.total, page: 1, pageSize: 50 }
  const run = (task: () => Promise<unknown>, success: string, done?: () => void) => startTransition(async () => {
    try { await task(); done?.(); setLeadPage(null); toast.success(success); router.refresh() }
    catch (error) { toast.error(error instanceof Error ? error.message : "Action impossible.") }
  })
  const archive = async (item: Rule | Segment, kind: "RULE" | "SEGMENT") => {
    if (await confirm({ title: `Archiver « ${item.name} » ?`, description: "L’historique sera conservé. Les règles archivées seront exclues du prochain recalcul ; les segments archivés ne pourront plus recevoir de nouveaux membres.", confirmLabel: "Archiver" })) run(() => updateMarketingObjectStatus({ id: item.id, kind, status: "ARCHIVED", expectedUpdatedAt: item.updatedAt }), "Objet archivé. Recalculez pour actualiser les scores.", () => { setEditingRule(null); setEditingSegment(null) })
  }
  const loadLeads = (page: number) => startTransition(async () => {
    try { setLeadPage(await getMarketingLeadPage({ page })) }
    catch (error) { toast.error(error instanceof Error ? error.message : "Chargement impossible.") }
  })
  const invalidatePreview = () => { previewVersion.current += 1; setPreview(null); setPreviewing(false) }
  const showPreview = async () => {
    if (!segmentForm.current) return
    const version = ++previewVersion.current
    setPreviewing(true)
    try {
      const result = await previewMarketingSegment(filtersFromForm(segmentForm.current, (editingSegment?.filters ?? {}) as SegmentFilters))
      if (version === previewVersion.current) setPreview(result)
    } catch (error) { if (version === previewVersion.current) toast.error(error instanceof Error ? error.message : "Aperçu impossible.") }
    finally { if (version === previewVersion.current) setPreviewing(false) }
  }
  const segmentFilters = (editingSegment?.filters ?? {}) as SegmentFilters
  return <div className="space-y-6">
    <div className="grid gap-4 sm:grid-cols-3"><Metric icon={Gauge} label="Prospects prioritaires" value={initialData.hot} detail="Score de 60 ou plus" /><Metric icon={Sparkles} label="Prospects à nourrir" value={initialData.warm} detail="Score entre 30 et 59" /><Metric icon={Filter} label="Segments actifs" value={initialData.segments.filter((item) => item.kind === "ACTIVE" && item.status === "ACTIVE").length} detail="Membres recalculés" /></div>
    <div className="flex flex-col justify-between gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center"><div><p className="text-sm font-semibold">Moteur de qualification</p><p className="mt-1 text-xs text-muted-foreground">Le détail de chaque score reste explicable et les listes actives sont reconstruites sans doublons.</p></div><Button demoMutation disabled={pending} onClick={() => run(async () => { const result = await refreshMarketingIntelligence(); toast.message(`${result.scored} prospect(s), ${result.segments} segment(s).`) }, "Qualification et segments actualisés.")}>{pending ? <Activity className="animate-spin" /> : <RefreshCw />}Tout recalculer</Button></div>
    <Tabs defaultValue="priorities" className="space-y-5">
      <TabsList><TabsTrigger value="priorities">Priorités</TabsTrigger><TabsTrigger value="rules">Règles de score</TabsTrigger><TabsTrigger value="segments">Segments</TabsTrigger></TabsList>
      <TabsContent value="priorities"><Card><CardHeader><div className="flex items-center gap-2"><CardTitle className="text-base">File triée par score</CardTitle><HelpTip label="Comment lire le score">Le score combine la complétude, l’avancement commercial et vos règles. Il aide à prioriser ; il ne remplace pas le jugement du commercial.</HelpTip></div><CardDescription>Les points sont bornés de −100 à 200.</CardDescription></CardHeader><CardContent>
        {leads.rows.length ? <div className="divide-y rounded-xl border">{leads.rows.map((lead) => <div key={lead.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_120px_120px]"><div><p className="text-sm font-semibold">{lead.firstName} {lead.lastName}</p><p className="mt-1 text-xs text-muted-foreground">{lead.projectType || "Projet à qualifier"} · {lead.source} · {lead.city || "Ville inconnue"}</p><div className="mt-2 flex flex-wrap gap-1">{Array.isArray(lead.scoreBreakdown) && lead.scoreBreakdown.slice(0, 4).map((item, index) => {
          if (!item || typeof item !== "object" || Array.isArray(item) || typeof item.label !== "string" || typeof item.points !== "number") return null
          return <span key={`${item.label}-${index}`} title={item.label} className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{item.points > 0 ? "+" : ""}{item.points} {item.label}</span>
        })}</div></div><Badge variant={lead.score >= 60 ? "default" : lead.score >= 30 ? "secondary" : "outline"} className="w-fit self-start"><Gauge />{lead.score} points</Badge><span className="text-xs text-muted-foreground sm:text-right">{lead.status}</span></div>)}</div> : <p className="py-10 text-center text-sm text-muted-foreground">Aucun prospect actif.</p>}
        <Pagination {...leads} pending={pending} onPage={loadLeads} />
      </CardContent></Card></TabsContent>
      <TabsContent value="rules" className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <Card><CardHeader><CardTitle className="text-base">{editingRule ? "Modifier une règle" : "Ajouter une règle"}</CardTitle><CardDescription>Exemple : +20 si le type de projet contient « rénovation ».</CardDescription></CardHeader><CardContent>
          <form key={editingRule?.id ?? "new-rule"} className="space-y-4" onSubmit={(event) => {
            event.preventDefault(); const form = event.currentTarget, data = new FormData(form)
            const input = { name: data.get("name"), field: data.get("field"), operator: data.get("operator"), value: data.get("value"), points: data.get("points") }
            run(() => editingRule ? updateLeadScoringRule(editingRule.id, { ...input, expectedUpdatedAt: editingRule.updatedAt }) : createLeadScoringRule(input), editingRule ? "Règle enregistrée. Recalculez les scores." : "Règle créée.", () => { form.reset(); setEditingRule(null) })
          }}>
            <Field label="Nom"><Input name="name" required maxLength={120} defaultValue={editingRule?.name} /></Field>
            <div className="grid gap-3 sm:grid-cols-2"><Field label="Champ"><select name="field" className={controlClass} defaultValue={editingRule?.field}>{Object.entries(fieldLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="Opérateur"><select name="operator" className={controlClass} defaultValue={editingRule?.operator}><option value="EQUALS">est égal à</option><option value="NOT_EQUALS">est différent de</option><option value="CONTAINS">contient</option><option value="EXISTS">est renseigné</option></select></Field></div>
            <Field label="Valeur"><Input name="value" maxLength={120} placeholder="QUALIFIED, WEBSITE, rénovation…" defaultValue={editingRule?.value} /></Field><Field label="Points"><Input name="points" type="number" min="-100" max="100" required defaultValue={editingRule?.points ?? 10} /></Field>
            <div className="flex flex-wrap gap-2"><Button demoMutation type="submit" disabled={pending}><Plus />{editingRule ? "Enregistrer" : "Ajouter"}</Button>{editingRule && <Button type="button" variant="outline" disabled={pending} onClick={() => setEditingRule(null)}>Annuler</Button>}</div>
          </form>
        </CardContent></Card>
        <div className="space-y-3">{initialData.rules.map((rule) => <Card key={rule.id}><CardContent className="p-4"><div className="flex items-center gap-4"><span className={`grid size-11 place-items-center rounded-xl text-sm font-bold ${rule.points >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{rule.points > 0 ? "+" : ""}{rule.points}</span><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{rule.name}</p><p className="mt-1 truncate text-xs text-muted-foreground">{fieldLabels[rule.field] || rule.field} · {rule.operator} · {rule.value || "renseigné"}</p></div><Badge variant="outline">{rule.status}</Badge></div><ObjectCommands name={rule.name} archived={rule.status !== "ACTIVE"} pending={pending} onEdit={() => setEditingRule(rule)} onDuplicate={() => setDuplicate({ ...rule, kind: "RULE" })} onArchive={() => void archive(rule, "RULE")} /></CardContent></Card>)}{!initialData.rules.length && <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Aucune règle personnalisée. Le socle de qualification reste actif.</p>}</div>
      </TabsContent>
      <TabsContent value="segments" className="space-y-5">
        <Card><CardHeader><CardTitle className="text-base">{editingSegment ? "Modifier un segment" : "Nouveau segment"}</CardTitle><CardDescription>Les critères laissés vides sont ignorés. Une liste active est recalculée à chaque actualisation.</CardDescription></CardHeader><CardContent>
          <form ref={segmentForm} key={editingSegment?.id ?? "new-segment"} className="grid gap-4 lg:grid-cols-4" onChange={invalidatePreview} onSubmit={(event) => {
            event.preventDefault(); const form = event.currentTarget, data = new FormData(form)
            const input = { name: data.get("name"), description: data.get("description"), kind: editingSegment?.kind ?? data.get("kind"), filters: filtersFromForm(form, segmentFilters) }
            run(() => editingSegment ? updateMarketingSegment(editingSegment.id, { ...input, expectedUpdatedAt: editingSegment.updatedAt }) : createMarketingSegment(input), editingSegment ? "Segment enregistré. Recalculez les listes actives." : "Segment créé.", () => { form.reset(); setEditingSegment(null); invalidatePreview() })
          }}>
            <Field label="Nom"><Input name="name" required maxLength={120} defaultValue={editingSegment?.name} /></Field><Field label="Type"><select name="kind" className={controlClass} disabled={!!editingSegment} defaultValue={editingSegment?.kind}><option value="ACTIVE">Liste active</option><option value="STATIC">Liste statique</option></select></Field><Field label="Score minimum"><Input name="minScore" type="number" min="-100" max="200" defaultValue={segmentFilters.minScore} /></Field>
            <Field label="Statut"><select name="status" className={controlClass} defaultValue={segmentFilters.status ?? ""}><option value="">Tous</option><option value="NEW">Nouveau</option><option value="CONTACTED">Contacté</option><option value="QUALIFIED">Qualifié</option></select></Field><Field label="Source"><Input name="source" maxLength={120} defaultValue={segmentFilters.source} /></Field><Field label="Ville contient"><Input name="city" maxLength={120} defaultValue={segmentFilters.cityContains} /></Field><Field label="Projet contient"><Input name="projectType" maxLength={120} defaultValue={segmentFilters.projectTypeContains} /></Field>
            <Field label="Consentement"><select name="marketingOptIn" className={controlClass} defaultValue={String(segmentFilters.marketingOptIn ?? "")}><option value="">Tous</option><option value="true">Marketing accepté</option><option value="false">Marketing refusé</option></select></Field><Field label="Description"><Input name="description" maxLength={500} defaultValue={editingSegment?.description ?? ""} /></Field>
            <div className="flex flex-wrap items-end gap-2 lg:col-span-3"><Button demoMutation type="submit" disabled={pending}><Plus />{editingSegment ? "Enregistrer" : "Créer le segment"}</Button><Button type="button" variant="outline" disabled={previewing} onClick={() => void showPreview()}>{previewing ? "Calcul…" : "Aperçu d’éligibilité"}</Button>{editingSegment && <Button type="button" variant="outline" disabled={pending} onClick={() => { setEditingSegment(null); invalidatePreview() }}>Annuler</Button>}</div>
          </form>
          {preview && <div className="mt-4 rounded-xl border p-4" role="status"><p className="text-sm font-semibold">{preview.matched} prospect(s) correspondent aux critères sur {preview.examined} examinés.</p><p className="mt-1 text-xs text-muted-foreground">Aperçu du {new Date(preview.computedAt).toLocaleString("fr-FR")}, avec les scores enregistrés. Il ne constitue pas une autorisation d’envoi. Une liste statique conserve uniquement les membres ajoutés manuellement.</p><ul className="mt-2 text-xs">{preview.sample.map((lead) => <li key={lead.id}>{lead.firstName} {lead.lastName} · {lead.score} points</li>)}</ul></div>}
        </CardContent></Card>
        <div className="grid gap-4 lg:grid-cols-2">{initialData.segments.map((segment) => <Card key={segment.id}><CardHeader><div className="flex items-start justify-between gap-2"><div><CardTitle className="text-base">{segment.name}</CardTitle><CardDescription className="mt-1">{segment.description || "Sans description"}</CardDescription></div><Badge variant="secondary"><Users />{segment._count.memberships}</Badge></div></CardHeader><CardContent><div className="flex flex-wrap gap-1">{Object.entries(segment.filters as Record<string, unknown>).map(([key, value]) => <span key={key} className="rounded-full bg-muted px-2 py-1 text-[10px]">{key}: {String(value)}</span>)}</div><p className="mt-3 text-xs text-muted-foreground">{segment.kind === "ACTIVE" ? "Liste active" : "Liste statique"} · {segment.status}{segment.lastBuiltAt ? ` · mise à jour ${new Date(segment.lastBuiltAt).toLocaleString("fr-FR")}` : " · jamais calculée"}</p><ObjectCommands name={segment.name} archived={segment.status !== "ACTIVE"} pending={pending} onEdit={() => { setEditingSegment(segment); invalidatePreview() }} onDuplicate={() => setDuplicate({ ...segment, kind: "SEGMENT" })} onArchive={() => void archive(segment, "SEGMENT")} /><Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => setMembers(segment)}>Voir les membres</Button></CardContent></Card>)}</div>
      </TabsContent>
    </Tabs>
    <Dialog open={!!duplicate} onOpenChange={(open) => { if (!open && !pending) setDuplicate(null) }}><DialogContent><DialogHeader><DialogTitle>Dupliquer {duplicate?.name}</DialogTitle><DialogDescription>La copie sera active après confirmation. Une règle dupliquée pourra ajouter des points lors des prochains recalculs. Les membres d’une liste statique seront copiés ; une liste active devra être recalculée.</DialogDescription></DialogHeader><form key={duplicate?.id} className="space-y-4" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); if (duplicate) run(() => duplicateMarketingObject({ ...duplicate, expectedUpdatedAt: duplicate.updatedAt, name: data.get("name") }), "Copie créée.", () => setDuplicate(null)) }}><Field label="Nom de la copie"><Input name="name" required minLength={2} maxLength={120} defaultValue={`${duplicate?.name ?? ""} — copie`.slice(0, 120)} /></Field><Button demoMutation type="submit" disabled={pending}>Dupliquer</Button></form></DialogContent></Dialog>
    <Dialog open={!!members} onOpenChange={(open) => { if (!open) setMembers(null) }}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>Membres de {members?.name}</DialogTitle><DialogDescription>{members?.kind === "STATIC" ? "Ajoutez ou retirez des prospects de cette liste. Les campagnes actives verrouillent les changements." : "Les membres sont définis par les critères lors du recalcul."}</DialogDescription></DialogHeader>{members && <SegmentMembers key={members.id} segment={members} onChanged={() => router.refresh()} />}</DialogContent></Dialog>
  </div>
}

function ObjectCommands({ name, archived, pending, onEdit, onDuplicate, onArchive }: { name: string; archived: boolean; pending: boolean; onEdit: () => void; onDuplicate: () => void; onArchive: () => void }) {
  return <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={`Commandes pour ${name}`}><Button demoMutation variant="outline" size="sm" disabled={pending || archived} onClick={onEdit}>Modifier</Button><Button demoMutation variant="outline" size="sm" disabled={pending} onClick={onDuplicate}>Dupliquer</Button><Button demoMutation variant="outline" size="sm" disabled={pending || archived} onClick={onArchive}>Archiver</Button></div>
}

function SegmentMembers({ segment, onChanged }: { segment: Segment; onChanged: () => void }) {
  const [mode, setMode] = React.useState<"MEMBERS" | "CANDIDATES">("MEMBERS")
  const [page, setPage] = React.useState(1), [search, setSearch] = React.useState("")
  const [result, setResult] = React.useState<{ rows: LeadPage["rows"]; total: number } | null>(null)
  const [error, setError] = React.useState(""), [loading, setLoading] = React.useState(true), [saving, setSaving] = React.useState(false)
  const [selected, setSelected] = React.useState<string[]>([]), [revision, setRevision] = React.useState(0)
  const request = React.useRef(0), editable = segment.kind === "STATIC" && segment.status === "ACTIVE"
  React.useEffect(() => {
    let cancelled = false
    const version = ++request.current
    const task = mode === "MEMBERS" ? getSegmentMemberPage(segment.id, { page, search }) : getMarketingLeadPage({ page, search })
    void task.then((value) => {
      if (cancelled || version !== request.current) return
      const rows = mode === "MEMBERS" ? (value as MemberPage).rows.map((row) => row.leadCapture) : (value as LeadPage).rows
      setResult({ rows, total: value.total }); setError(""); setLoading(false)
    }).catch((reason) => { if (!cancelled && version === request.current) { setError(reason instanceof Error ? reason.message : "Chargement impossible."); setLoading(false) } })
    return () => { cancelled = true }
  }, [segment.id, mode, page, search, revision])
  const changeView = (nextMode: typeof mode, nextPage: number, nextSearch: string) => {
    request.current += 1; setLoading(true); setResult(null); setSelected([]); setError(""); setMode(nextMode); setPage(nextPage); setSearch(nextSearch); setRevision((value) => value + 1)
  }
  const save = async () => {
    setSaving(true)
    try {
      await updateStaticSegmentMembers({ segmentId: segment.id, operation: mode === "MEMBERS" ? "REMOVE" : "ADD", leadIds: selected })
      toast.success(mode === "MEMBERS" ? "Prospects retirés." : "Prospects ajoutés. Les membres déjà présents sont conservés sans doublon.")
      changeView(mode, 1, search); onChanged()
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : "Modification impossible.") }
    finally { setSaving(false) }
  }
  return <div className="space-y-4">
    {editable && <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={saving || mode === "MEMBERS"} onClick={() => changeView("MEMBERS", 1, "")}>Membres actuels</Button><Button demoMutation variant="outline" size="sm" disabled={saving || mode === "CANDIDATES"} onClick={() => changeView("CANDIDATES", 1, "")}>Ajouter des prospects</Button></div>}
    <form className="flex items-end gap-2" onSubmit={(event) => { event.preventDefault(); changeView(mode, 1, String(new FormData(event.currentTarget).get("search") ?? "")) }}><Field label="Rechercher un prospect"><Input name="search" maxLength={120} disabled={saving} /></Field><Button type="submit" variant="outline" disabled={saving}>Rechercher</Button></form>
    {loading ? <p role="status" className="text-sm">Chargement…</p> : error ? <p role="alert" className="text-sm">{error}</p> : result && <>
      <ul className="divide-y rounded-xl border">{result.rows.map((lead) => <li key={lead.id} className="p-3"><label className="flex items-center gap-3">{editable && <input type="checkbox" aria-label={`Sélectionner ${lead.firstName} ${lead.lastName}`} disabled={saving} checked={selected.includes(lead.id)} onChange={(event) => setSelected((value) => event.target.checked ? [...value, lead.id] : value.filter((id) => id !== lead.id))} />}<span className="text-sm">{lead.firstName} {lead.lastName}<span className="ml-2 text-xs text-muted-foreground">{lead.email || "Sans e-mail"} · {lead.score} points</span></span></label></li>)}</ul>
      {!result.rows.length && <p className="text-sm text-muted-foreground">Aucun prospect trouvé.</p>}
      <Pagination page={page} pageSize={50} total={result.total} pending={saving} onPage={(value) => changeView(mode, value, search)} />
      {editable && <Button demoMutation disabled={saving || selected.length === 0} onClick={() => void save()}>{mode === "MEMBERS" ? "Retirer la sélection" : "Ajouter la sélection"} ({selected.length})</Button>}
    </>}
  </div>
}

function Pagination({ page, pageSize, total, pending, onPage }: { page: number; pageSize: number; total: number; pending: boolean; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  return <nav aria-label="Pagination des prospects" className="mt-4 flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted-foreground">Page {page} sur {pages} · {total} prospect(s)</p><div className="flex gap-2"><Button type="button" variant="outline" size="sm" disabled={pending || page <= 1} onClick={() => onPage(page - 1)}>Page précédente</Button><Button type="button" variant="outline" size="sm" disabled={pending || page >= pages} onClick={() => onPage(page + 1)}>Page suivante</Button></div></nav>
}
function Field({ label, children }: { label: string; children: React.ReactElement<{ id?: string }> }) { const id = React.useId(); return <div className="space-y-1.5"><Label htmlFor={id}>{label}</Label>{React.cloneElement(children, { id })}</div> }
function Metric({ icon: Icon, label, value, detail }: { icon: typeof Gauge; label: string; value: number; detail: string }) { return <Card><CardContent className="flex items-center gap-4 p-5"><span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="size-4" /></span><div><p className="text-2xl font-semibold">{value}</p><p className="text-xs font-medium">{label}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{detail}</p></div></CardContent></Card> }
