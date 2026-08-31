"use client"

import { useMemo, useState, useTransition } from "react"
import { Archive, ArrowLeft, Bell, Bot, CheckCircle2, Copy, FilePenLine, Filter, FlaskConical, GitBranch, History, ListChecks, Pause, Play, Plus, Search, Send, Split, Workflow, XCircle } from "lucide-react"
import { toast } from "sonner"

import { createAutomationWorkflow, duplicateAutomationWorkflow, simulateAutomationWorkflow, updateAutomationWorkflow, updateAutomationWorkflowStatus } from "@/actions/automations"
import type { AutomationData, AutomationRunner, AutomationWorkflow } from "@/app/dashboard/automatisations/automation-model"
import { ACTION_LABELS, controlClass, formatAutomationDate, STATUS_LABELS, TRIGGER_LABELS } from "@/app/dashboard/automatisations/automation-model"
import { EmptyState } from "@/components/shared/empty-state"
import { useConfirm } from "@/components/shared/confirm-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { HelpTip } from "@/components/ui/help-tip"
import { Input } from "@/components/ui/input"

type LeafAction = { type: "ENROLL_SEQUENCE" | "CREATE_TASK" | "NOTIFY_TEAM" | "UPDATE_LEAD_STATUS"; sequenceId?: string; title?: string; delayHours?: number; priority?: number; status?: string }
type BranchAction = { type: "CONDITIONAL_BRANCH"; label: string; conditions: Record<string, unknown>; ifTrue: LeafAction[]; ifFalse: LeafAction[] }
type WorkflowAction = LeafAction | BranchAction

function actionList(value: unknown): WorkflowAction[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is WorkflowAction => {
    if (!item || typeof item !== "object" || !("type" in item)) return false
    return ["ENROLL_SEQUENCE", "CREATE_TASK", "NOTIFY_TEAM", "UPDATE_LEAD_STATUS", "CONDITIONAL_BRANCH"].includes(String(item.type))
  })
}

function conditionObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export function WorkflowStudio({ data, pending, run }: { data: AutomationData; pending: boolean; run: AutomationRunner }) {
  const confirm = useConfirm()
  const [selectedId, setSelectedId] = useState(data.workflows[0]?.id ?? "")
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState("ALL")
  const [builder, setBuilder] = useState<{ mode: "CREATE" | "EDIT"; workflow?: AutomationWorkflow } | null>(null)
  const filtered = useMemo(() => data.workflows.filter((workflow) => workflow.name.toLocaleLowerCase("fr").includes(query.trim().toLocaleLowerCase("fr")) && (status === "ALL" || workflow.status === status)), [data.workflows, query, status])
  const selected = data.workflows.find((workflow) => workflow.id === selectedId) ?? filtered[0] ?? data.workflows[0]

  async function archive(workflow: AutomationWorkflow) {
    const accepted = await confirm({ title: "Archiver ce workflow ?", description: "Il ne se déclenchera plus et disparaîtra du studio. Son historique restera conservé.", confirmLabel: "Archiver", destructive: true })
    if (accepted) run(() => updateAutomationWorkflowStatus(workflow.id, "ARCHIVED"), "Workflow archivé.")
  }

  if (builder) return <WorkflowBuilder key={builder.workflow?.id ?? "new"} data={data} workflow={builder.workflow} pending={pending} run={run} onClose={() => setBuilder(null)} />

  return <div className="space-y-4">
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 sm:flex-row sm:items-center"><div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un workflow…" className="pl-9" aria-label="Rechercher un workflow" /></div><select value={status} onChange={(event) => setStatus(event.target.value)} className={`${controlClass} sm:w-44`} aria-label="Filtrer les workflows"><option value="ALL">Tous les états</option><option value="DRAFT">Brouillons</option><option value="ACTIVE">Actifs</option><option value="PAUSED">En pause</option></select><Button onClick={() => setBuilder({ mode: "CREATE" })}><Plus />Nouveau workflow</Button></div>
    {data.workflows.length ? <div className="grid min-h-[660px] overflow-hidden rounded-xl border bg-card xl:grid-cols-[310px_minmax(0,1fr)]"><aside className="border-b xl:border-b-0 xl:border-r"><div className="flex items-center justify-between border-b px-4 py-3"><div><p className="text-sm font-semibold">Règles</p><p className="text-xs text-muted-foreground">{filtered.length} résultat(s)</p></div><Workflow className="size-4 text-muted-foreground" /></div><div className="max-h-[660px] overflow-y-auto p-2">{filtered.length ? filtered.map((workflow) => <WorkflowListItem key={workflow.id} workflow={workflow} active={selected?.id === workflow.id} onSelect={() => setSelectedId(workflow.id)} />) : <p className="px-3 py-10 text-center text-sm text-muted-foreground">Aucun workflow ne correspond aux filtres.</p>}</div></aside>{selected && <WorkflowDetail workflow={selected} data={data} pending={pending} run={run} onEdit={() => setBuilder({ mode: "EDIT", workflow: selected })} onArchive={() => archive(selected)} />}</div> : <div className="rounded-xl border bg-card"><EmptyState icon={Workflow} title="Créez votre première règle" description="Déclenchez une action lors d’un changement CRM, testez-la sur un enregistrement puis publiez une version traçable." action={<Button onClick={() => setBuilder({ mode: "CREATE" })}><Plus />Créer un workflow</Button>} /></div>}
  </div>
}

function WorkflowListItem({ workflow, active, onSelect }: { workflow: AutomationWorkflow; active: boolean; onSelect: () => void }) {
  const lastRun = workflow.runs[0]
  return <button type="button" onClick={onSelect} className={`mb-1 w-full rounded-lg px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? "bg-primary/[0.07]" : "hover:bg-muted/60"}`}><span className="flex items-start justify-between gap-2"><span className="min-w-0"><span className="block truncate text-sm font-medium">{workflow.name}</span><span className="mt-1 block truncate text-xs text-muted-foreground">{TRIGGER_LABELS[workflow.trigger] ?? workflow.trigger}</span></span><Badge variant={workflow.status === "ACTIVE" ? "default" : "outline"}>{STATUS_LABELS[workflow.status] ?? workflow.status}</Badge></span>{lastRun && <span className={`mt-2 flex items-center gap-1 text-[11px] ${lastRun.status === "FAILED" ? "text-destructive" : "text-muted-foreground"}`}>{lastRun.status === "FAILED" ? <XCircle className="size-3" /> : <CheckCircle2 className="size-3" />}Dernière exécution : {STATUS_LABELS[lastRun.status] ?? lastRun.status}</span>}</button>
}

function WorkflowDetail({ workflow, data, pending, run, onEdit, onArchive }: { workflow: AutomationWorkflow; data: AutomationData; pending: boolean; run: AutomationRunner; onEdit: () => void; onArchive: () => void }) {
  const [simulationPending, startSimulation] = useTransition()
  const [simulation, setSimulation] = useState<Awaited<ReturnType<typeof simulateAutomationWorkflow>> | null>(null)
  const actions = actionList(workflow.actions)
  const conditions = conditionObject(workflow.conditions)
  const completed = workflow.runs.filter((item) => item.status === "COMPLETED").length
  const failed = workflow.runs.filter((item) => item.status === "FAILED").length

  return <section className="min-w-0">
    <header className="border-b px-4 py-4 sm:px-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-lg font-semibold">{workflow.name}</h2><Badge variant={workflow.status === "ACTIVE" ? "default" : "outline"}>{STATUS_LABELS[workflow.status] ?? workflow.status}</Badge>{workflow.publishedVersion && <Badge variant="secondary">v{workflow.publishedVersion} publiée</Badge>}</div><p className="mt-1 text-sm text-muted-foreground">{TRIGGER_LABELS[workflow.trigger] ?? workflow.trigger}</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={workflow.status === "ACTIVE"} onClick={onEdit}><FilePenLine />Modifier</Button><Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => duplicateAutomationWorkflow(workflow.id), "Copie créée en brouillon.")}><Copy />Dupliquer</Button>{workflow.status === "ACTIVE" ? <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => updateAutomationWorkflowStatus(workflow.id, "PAUSED"), "Workflow mis en pause.")}><Pause />Mettre en pause</Button> : <Button size="sm" disabled={pending} onClick={() => run(() => updateAutomationWorkflowStatus(workflow.id, "ACTIVE"), "Version publiée et workflow activé.")}><Play />Publier et activer</Button>}<Button size="icon-sm" variant="ghost" onClick={onArchive} disabled={pending} aria-label={`Archiver ${workflow.name}`}><Archive /></Button></div></div>{workflow.status === "ACTIVE" && <p className="mt-3 rounded-lg bg-muted/45 px-3 py-2 text-xs text-muted-foreground">Mettez la règle en pause pour modifier sa configuration. La prochaine activation publiera une nouvelle version.</p>}<div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t pt-4 text-xs text-muted-foreground"><span><strong className="text-foreground">{completed}</strong> réussite(s) récente(s)</span><span><strong className={failed ? "text-destructive" : "text-foreground"}>{failed}</strong> échec(s)</span><span><strong className="text-foreground">{workflow.versions.length}</strong> version(s) visible(s)</span><span>Mis à jour {formatAutomationDate(workflow.updatedAt)}</span></div></header>
    <div className="grid 2xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-5 p-4 sm:p-5 2xl:border-r">
        <div><h3 className="text-sm font-semibold">Logique publiée</h3><p className="mt-1 text-xs text-muted-foreground">Lecture synthétique du déclencheur, des critères et des actions.</p></div>
        <div className="space-y-3"><FlowNode icon={Bot} label="Quand" title={TRIGGER_LABELS[workflow.trigger] ?? workflow.trigger} detail="Chaque événement est dédupliqué par une clé d’idempotence." />{Object.keys(conditions).length > 0 && <FlowNode icon={Filter} label="Si" title={describeConditions(conditions)} detail="Toutes les conditions d’inscription doivent être remplies." />}{actions.map((action, index) => action.type === "CONDITIONAL_BRANCH" ? <BranchSummary key={`${action.type}-${index}`} action={action} data={data} /> : <FlowNode key={`${action.type}-${index}`} icon={action.type === "ENROLL_SEQUENCE" ? Send : action.type === "NOTIFY_TEAM" ? Bell : ListChecks} label={`Action ${index + 1}`} title={describeAction(action, data)} detail={ACTION_LABELS[action.type] ?? action.type} />)}</div>

        <Card><CardHeader><div className="flex items-center gap-2"><FlaskConical className="size-4 text-primary" /><CardTitle className="text-sm">Tester sans effet</CardTitle></div><CardDescription>Évalue les conditions et les branches sans envoyer d’e-mail ni modifier de fiche.</CardDescription></CardHeader><CardContent><form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(event) => { event.preventDefault(); const subjectId = String(new FormData(event.currentTarget).get("subjectId")); startSimulation(async () => { try { const result = await simulateAutomationWorkflow(workflow.id, subjectId); setSimulation(result); toast.success("Simulation terminée sans effet.") } catch (error) { toast.error(error instanceof Error ? error.message : "Simulation impossible") } }) }}><Field label={workflow.trigger === "CUSTOMER_HEALTH_CHANGED" ? "Client de test" : "Prospect de test"}><select name="subjectId" className={controlClass} required><option value="">Sélectionner…</option>{workflow.trigger === "CUSTOMER_HEALTH_CHANGED" ? data.clients.map((client) => <option key={client.id} value={client.id}>{client.name} · {client.score}/100</option>) : data.leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.firstName} {lead.lastName} · {lead.projectType || lead.source}</option>)}</select></Field><Button type="submit" variant="outline" disabled={simulationPending}><FlaskConical />{simulationPending ? "Simulation…" : "Simuler"}</Button></form>{simulation && <div className={`mt-4 rounded-lg border p-3 ${simulation.matches ? "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100" : "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"}`}><p className="text-sm font-semibold">{simulation.matches ? "Conditions remplies" : "Conditions non remplies"} · {simulation.lead}</p><div className="mt-2 space-y-1 text-xs opacity-80">{simulation.trace.map((item, index) => <p key={`${item.type}-${index}`}>{item.type === "BRANCH" ? `${item.label} → chemin ${item.selected === "TRUE" ? "vrai" : "alternatif"}` : `${item.label} → ${item.matched ? "oui" : "non"}`}</p>)}<p>Actions prévues : {simulation.actions.map((item) => ACTION_LABELS[item.type] ?? item.type).join(", ") || "aucune"}</p></div></div>}</CardContent></Card>
      </div>
      <aside className="space-y-5 p-4 sm:p-5"><div><h3 className="text-sm font-semibold">Versions</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Les publications sont immuables et les nouveaux réglages créent un brouillon.</p></div><div className="divide-y">{workflow.versions.map((version) => <div key={version.id} className="flex items-center gap-3 py-3"><span className="grid size-8 place-items-center rounded-lg bg-muted font-mono text-xs font-semibold">v{version.version}</span><div className="min-w-0 flex-1"><p className="text-xs font-medium">{STATUS_LABELS[version.status] ?? version.status}</p><p className="text-[11px] text-muted-foreground">{formatAutomationDate(version.publishedAt || version.createdAt)}</p></div>{version.version === workflow.publishedVersion && <Badge variant="secondary">En ligne</Badge>}</div>)}</div><div className="border-t pt-4"><h3 className="text-sm font-semibold">Exécutions récentes</h3>{workflow.runs.length ? <div className="mt-2 divide-y">{workflow.runs.map((item) => <div key={item.id} className="py-3"><div className="flex items-center justify-between gap-2"><Badge variant={item.status === "FAILED" ? "destructive" : item.status === "COMPLETED" ? "secondary" : "outline"}>{STATUS_LABELS[item.status] ?? item.status}</Badge><time className="text-[11px] text-muted-foreground">{formatAutomationDate(item.startedAt)}</time></div><p className="mt-1 truncate text-xs text-muted-foreground">{item.event} · {item.subjectModel}</p>{item.error && <p className="mt-1 text-xs leading-5 text-destructive">{item.error}</p>}</div>)}</div> : <p className="mt-3 rounded-lg bg-muted/35 px-3 py-4 text-xs text-muted-foreground">Aucune exécution pour le moment.</p>}</div></aside>
    </div>
  </section>
}

function WorkflowBuilder({ data, workflow, pending, run, onClose }: { data: AutomationData; workflow?: AutomationWorkflow; pending: boolean; run: AutomationRunner; onClose: () => void }) {
  const initialActions = actionList(workflow?.actions)
  const initialAction = initialActions[0]
  const initialBranch = initialAction?.type === "CONDITIONAL_BRANCH" ? initialAction : null
  const initialLeafAction = initialAction?.type !== "CONDITIONAL_BRANCH" ? initialAction : undefined
  const initialConditions = conditionObject(workflow?.conditions)
  const branchConditions = initialBranch ? conditionObject(initialBranch.conditions) : {}
  const trueAction = initialBranch?.ifTrue[0]
  const falseAction = initialBranch?.ifFalse[0]
  const [name, setName] = useState(workflow?.name ?? "")
  const [trigger, setTrigger] = useState(workflow?.trigger ?? "LEAD_CREATED")
  const [mode, setMode] = useState<"STANDARD" | "BRANCH">(initialBranch ? "BRANCH" : "STANDARD")
  const [actionType, setActionType] = useState<LeafAction["type"]>(initialBranch ? "CREATE_TASK" : initialLeafAction?.type ?? "ENROLL_SEQUENCE")
  const healthTrigger = trigger === "CUSTOMER_HEALTH_CHANGED"

  function submit(form: HTMLFormElement) {
    const values = new FormData(form)
    const source = String(values.get("source") || "")
    const leadStatus = String(values.get("leadStatus") || "")
    const healthStatus = String(values.get("healthStatus") || "")
    const scoreBelow = String(values.get("healthScoreBelow") || "")
    const scoreDrop = String(values.get("healthScoreDropAtLeast") || "")
    const conditions = { ...(source ? { source } : {}), ...(leadStatus ? { leadStatus } : {}), ...(healthStatus ? { healthStatus } : {}), ...(scoreBelow ? { healthScoreBelow: Number(scoreBelow) } : {}), ...(scoreDrop ? { healthScoreDropAtLeast: Number(scoreDrop) } : {}) }
    const actions = mode === "BRANCH" ? [buildBranch(values)] : [buildLeafAction(values, actionType)]
    const input = { name, trigger, conditions, actions }
    run(
      () => workflow ? updateAutomationWorkflow(workflow.id, input) : createAutomationWorkflow(input),
      workflow ? "Nouvelle version brouillon enregistrée." : "Workflow créé en brouillon.",
      { after: onClose },
    )
  }

  return <div className="overflow-hidden rounded-xl border bg-card">
    <header className="flex flex-col gap-3 border-b px-4 py-4 sm:px-5 lg:flex-row lg:items-start lg:justify-between"><div className="flex items-start gap-3"><Button size="icon-sm" variant="ghost" onClick={onClose} aria-label="Retour aux workflows"><ArrowLeft /></Button><div><div className="flex items-center gap-2"><h2 className="text-lg font-semibold">{workflow ? "Modifier le workflow" : "Nouveau workflow"}</h2>{workflow && <Badge variant="outline">Nouvelle version</Badge>}</div><p className="mt-1 text-sm text-muted-foreground">Construisez la logique, puis testez-la sur une fiche avant publication.</p></div></div><div className="flex items-center gap-2"><HelpTip label="Publication">L’enregistrement crée un brouillon. Aucune action ne s’exécute avant la publication depuis la fiche du workflow.</HelpTip><Button type="submit" form="workflow-builder-form" disabled={pending || name.trim().length < 2}>Enregistrer le brouillon</Button></div></header>
    <form id="workflow-builder-form" onSubmit={(event) => { event.preventDefault(); submit(event.currentTarget) }} className="grid 2xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-6 p-4 sm:p-6 2xl:border-r">
        <BuilderSection number="1" title="Déclenchement" description="Choisissez l’événement métier qui lance l’évaluation."><div className="grid gap-4 lg:grid-cols-2"><Field label="Nom du workflow"><Input aria-label="Nom du workflow" value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={120} placeholder="Qualifier les nouvelles demandes" /></Field><Field label="Événement"><select aria-label="Événement" name="trigger" value={trigger} onChange={(event) => { const next = event.target.value; setTrigger(next); if (next === "CUSTOMER_HEALTH_CHANGED" && !["CREATE_TASK", "NOTIFY_TEAM"].includes(actionType)) setActionType("CREATE_TASK") }} className={controlClass}>{Object.entries(TRIGGER_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field></div></BuilderSection>
        <BuilderSection number="2" title="Critères d’inscription" description="Laissez les champs vides pour accepter tous les événements de ce type.">{healthTrigger ? <div className="grid gap-4 md:grid-cols-3"><Field label="Niveau de santé"><select aria-label="Niveau de santé" name="healthStatus" defaultValue={String(initialConditions.healthStatus ?? "")} className={controlClass}><option value="">Tous</option><option value="RISK">À risque</option><option value="WATCH">À surveiller</option><option value="HEALTHY">Sain</option></select></Field><Field label="Score maximal"><Input aria-label="Score maximal" name="healthScoreBelow" type="number" min="0" max="100" defaultValue={initialConditions.healthScoreBelow === undefined ? "" : String(initialConditions.healthScoreBelow)} placeholder="49" /></Field><Field label="Baisse minimale"><Input aria-label="Baisse minimale" name="healthScoreDropAtLeast" type="number" min="1" max="100" defaultValue={initialConditions.healthScoreDropAtLeast === undefined ? "" : String(initialConditions.healthScoreDropAtLeast)} placeholder="10" /></Field></div> : <div className="grid gap-4 md:grid-cols-2"><Field label="Source exacte"><Input aria-label="Source exacte" name="source" defaultValue={String(initialConditions.source ?? "")} maxLength={80} placeholder="WEBSITE" /></Field><Field label="Statut prospect"><select aria-label="Statut prospect" name="leadStatus" defaultValue={String(initialConditions.leadStatus ?? "")} className={controlClass}><option value="">Tous les statuts</option><option value="NEW">Nouveau</option><option value="CONTACTED">Contacté</option><option value="QUALIFIED">Qualifié</option></select></Field></div>}</BuilderSection>
        <BuilderSection number="3" title="Action" description="Utilisez une action simple ou une branche vrai/faux."><div className="mb-4 flex w-fit rounded-lg border bg-muted/30 p-1"><Button type="button" size="sm" variant={mode === "STANDARD" ? "secondary" : "ghost"} onClick={() => setMode("STANDARD")}><ListChecks />Action simple</Button><Button type="button" size="sm" variant={mode === "BRANCH" ? "secondary" : "ghost"} onClick={() => setMode("BRANCH")} disabled={healthTrigger}><GitBranch />Branche si/alors</Button></div>{mode === "STANDARD" ? <StandardActionFields action={initialBranch ? undefined : initialAction} actionType={actionType} onActionTypeChange={(value) => setActionType(value as LeafAction["type"])} healthTrigger={healthTrigger} sequences={data.sequences} /> : <BranchFields conditions={branchConditions} trueAction={trueAction} falseAction={falseAction} />}</BuilderSection>
      </div>
      <aside className="space-y-5 bg-muted/20 p-4 sm:p-5"><div><h3 className="text-sm font-semibold">Aperçu de la logique</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Cette vue résume le chemin. Utilisez la simulation après l’enregistrement pour vérifier les valeurs réelles.</p></div><div className="space-y-3"><FlowNode icon={Bot} label="Quand" title={TRIGGER_LABELS[trigger] ?? trigger} detail="Événement dédupliqué" /><FlowNode icon={Filter} label="Si" title={healthTrigger ? "Critères de santé configurés" : "Source et statut éventuels"} detail="Tous les critères renseignés doivent être vrais" />{mode === "BRANCH" ? <div className="rounded-lg border bg-card p-3"><div className="flex items-center gap-2"><Split className="size-4 text-primary" /><p className="text-xs font-semibold">Branche conditionnelle</p></div><div className="mt-3 grid grid-cols-2 gap-2"><div className="rounded-md bg-emerald-50 p-2 text-xs text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100"><strong className="block">Vrai</strong>Modifier le statut</div><div className="rounded-md bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/50 dark:text-amber-100"><strong className="block">Sinon</strong>Tâche ou notification</div></div></div> : <FlowNode icon={actionType === "ENROLL_SEQUENCE" ? Send : actionType === "NOTIFY_TEAM" ? Bell : ListChecks} label="Alors" title={ACTION_LABELS[actionType] ?? actionType} detail="Une action exécutée par événement" />}</div><div className="rounded-lg border bg-card p-3 text-xs leading-5 text-muted-foreground"><History className="mr-1 inline size-4 text-primary" />Chaque enregistrement crée une version brouillon. La publication et les exécutions restent consultables dans l’historique.</div></aside>
    </form>
  </div>
}

function StandardActionFields({ action, actionType, onActionTypeChange, healthTrigger, sequences }: { action?: WorkflowAction; actionType: string; onActionTypeChange: (type: string) => void; healthTrigger: boolean; sequences: AutomationData["sequences"] }) {
  const leaf = action && action.type !== "CONDITIONAL_BRANCH" ? action : undefined
  return <div className="grid gap-4 lg:grid-cols-2"><Field label="Type d’action"><select aria-label="Type d’action" name="actionType" value={actionType} onChange={(event) => onActionTypeChange(event.target.value)} className={controlClass}>{!healthTrigger && <option value="ENROLL_SEQUENCE">Inscrire dans une séquence</option>}<option value="CREATE_TASK">Créer une tâche</option><option value="NOTIFY_TEAM">Notifier l’équipe</option>{!healthTrigger && <option value="UPDATE_LEAD_STATUS">Modifier le statut prospect</option>}</select></Field>{actionType === "ENROLL_SEQUENCE" && <Field label="Séquence"><select aria-label="Séquence" name="sequenceId" defaultValue={leaf?.sequenceId ?? ""} className={controlClass} required><option value="">Sélectionner…</option>{sequences.map((sequence) => <option key={sequence.id} value={sequence.id}>{sequence.name}</option>)}</select></Field>}{["CREATE_TASK", "NOTIFY_TEAM"].includes(actionType) && <Field label="Titre"><Input aria-label="Titre" name="actionTitle" defaultValue={leaf?.title ?? (healthTrigger ? "Suivre {{client.name}} · santé {{health.score}}/100" : "Suivre {{contact.firstName}} {{contact.lastName}}") } required minLength={2} maxLength={180} /></Field>}{actionType === "CREATE_TASK" && <Field label="Délai"><Input aria-label="Délai" name="delayHours" type="number" min="0" max="8760" defaultValue={leaf?.delayHours ?? 24} /></Field>}{actionType === "UPDATE_LEAD_STATUS" && <Field label="Nouveau statut"><select aria-label="Nouveau statut" name="targetLeadStatus" defaultValue={leaf?.status ?? "QUALIFIED"} className={controlClass}><option value="CONTACTED">Contacté</option><option value="QUALIFIED">Qualifié</option><option value="ARCHIVED">Archivé</option></select></Field>}</div>
}

function BranchFields({ conditions, trueAction, falseAction }: { conditions: Record<string, unknown>; trueAction?: LeafAction; falseAction?: LeafAction }) {
  return <div className="space-y-4"><div className="grid gap-4 md:grid-cols-3"><Field label="Nom de la branche"><Input name="branchLabel" defaultValue="Critère de qualification" required minLength={2} maxLength={120} /></Field><Field label="Critère"><select name="branchField" defaultValue={Object.keys(conditions)[0] || "projectTypeContains"} className={controlClass}><option value="projectTypeContains">Type de projet contient</option><option value="source">Source égale</option><option value="leadStatus">Statut prospect égal</option><option value="marketingOptIn">Consentement marketing égal</option></select></Field><Field label="Valeur"><Input name="branchValue" defaultValue={String(Object.values(conditions)[0] ?? "couverture")} required /></Field></div><div className="grid gap-4 rounded-lg border p-4 md:grid-cols-2"><div className="space-y-3"><p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Chemin vrai</p><Field label="Statut à appliquer"><select name="trueStatus" defaultValue={trueAction?.status ?? "QUALIFIED"} className={controlClass}><option value="QUALIFIED">Qualifier le prospect</option><option value="CONTACTED">Marquer contacté</option><option value="ARCHIVED">Archiver</option></select></Field></div><div className="space-y-3"><p className="text-xs font-semibold text-amber-700 dark:text-amber-300">Chemin alternatif</p><Field label="Action"><select name="falseType" defaultValue={falseAction?.type ?? "CREATE_TASK"} className={controlClass}><option value="CREATE_TASK">Créer une tâche</option><option value="NOTIFY_TEAM">Notifier l’équipe</option></select></Field><Field label="Titre"><Input name="falseTitle" defaultValue={falseAction?.title ?? "Vérifier le besoin de {{contact.firstName}}"} required minLength={2} maxLength={180} /></Field><Field label="Délai"><Input name="falseDelayHours" type="number" min="0" max="8760" defaultValue={falseAction?.delayHours ?? 4} /></Field></div></div></div>
}

function buildLeafAction(form: FormData, type: string): LeafAction {
  if (type === "ENROLL_SEQUENCE") return { type, sequenceId: String(form.get("sequenceId")) }
  if (type === "CREATE_TASK") return { type, title: String(form.get("actionTitle")), delayHours: Number(form.get("delayHours") || 0), priority: 2 }
  if (type === "UPDATE_LEAD_STATUS") return { type, status: String(form.get("targetLeadStatus")) }
  return { type: "NOTIFY_TEAM", title: String(form.get("actionTitle")) }
}

function buildBranch(form: FormData): BranchAction {
  const field = String(form.get("branchField"))
  const rawValue = String(form.get("branchValue") || "")
  const conditions = field === "marketingOptIn" ? { marketingOptIn: rawValue === "true" } : { [field]: rawValue }
  const falseType = String(form.get("falseType"))
  return { type: "CONDITIONAL_BRANCH", label: String(form.get("branchLabel")), conditions, ifTrue: [{ type: "UPDATE_LEAD_STATUS", status: String(form.get("trueStatus")) }], ifFalse: [falseType === "NOTIFY_TEAM" ? { type: "NOTIFY_TEAM", title: String(form.get("falseTitle")) } : { type: "CREATE_TASK", title: String(form.get("falseTitle")), delayHours: Number(form.get("falseDelayHours") || 0), priority: 2 }] }
}

function describeConditions(conditions: Record<string, unknown>) {
  return Object.entries(conditions).map(([key, value]) => `${conditionLabel(key)} : ${String(value)}`).join(" · ")
}

function conditionLabel(key: string) {
  return ({ source: "Source", leadStatus: "Statut", marketingOptIn: "Consentement", projectTypeContains: "Projet contient", healthStatus: "Santé", healthScoreBelow: "Score maximal", healthScoreDropAtLeast: "Baisse minimale" } as Record<string, string>)[key] ?? key
}

function describeAction(action: LeafAction, data: AutomationData) {
  if (action.type === "ENROLL_SEQUENCE") return data.sequences.find((item) => item.id === action.sequenceId)?.name || "Séquence introuvable"
  if (action.type === "UPDATE_LEAD_STATUS") return `Passer le prospect au statut ${action.status}`
  return action.title || ACTION_LABELS[action.type] || action.type
}

function BranchSummary({ action, data }: { action: BranchAction; data: AutomationData }) {
  return <div className="rounded-lg border bg-muted/15 p-4"><div className="flex items-center gap-2"><GitBranch className="size-4 text-primary" /><p className="text-sm font-semibold">{action.label}</p></div><p className="mt-1 text-xs text-muted-foreground">{describeConditions(action.conditions)}</p><div className="mt-3 grid gap-2 sm:grid-cols-2"><div className="rounded-md bg-emerald-50 p-3 text-xs text-emerald-950 dark:bg-emerald-950/50 dark:text-emerald-100"><strong className="block">Si vrai</strong>{action.ifTrue.map((item) => describeAction(item, data)).join(", ")}</div><div className="rounded-md bg-amber-50 p-3 text-xs text-amber-950 dark:bg-amber-950/50 dark:text-amber-100"><strong className="block">Sinon</strong>{action.ifFalse.length ? action.ifFalse.map((item) => describeAction(item, data)).join(", ") : "Aucune action"}</div></div></div>
}

function FlowNode({ icon: Icon, label, title, detail }: { icon: typeof Bot; label: string; title: string; detail: string }) {
  return <div className="flex gap-3 rounded-lg border bg-card p-3.5"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="size-4" /></span><div className="min-w-0"><p className="text-[11px] font-medium text-muted-foreground">{label}</p><p className="mt-0.5 break-words text-sm font-semibold">{title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p></div></div>
}

function BuilderSection({ number, title, description, children }: { number: string; title: string; description: string; children: React.ReactNode }) {
  return <section><div className="mb-4 flex gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary text-xs font-semibold text-primary-foreground">{number}</span><div><h3 className="text-sm font-semibold">{title}</h3><p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p></div></div><div className="sm:pl-10">{children}</div></section>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block min-w-0 flex-1 space-y-1.5"><span className="block text-xs font-semibold">{label}</span>{children}</label>
}
