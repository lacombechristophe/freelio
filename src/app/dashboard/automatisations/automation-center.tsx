"use client"

import { useState, useTransition } from "react"
import { Activity, Bot, CheckCircle2, Clock3, Eye, Mail, Pause, PhoneCall, Play, Plus, Send, Square, Users } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import {
  addEmailSequenceStep,
  createAutomationWorkflow,
  createEmailSequence,
  createEmailTemplate,
  enrollLeadInSequence,
  pauseSequenceEnrollment,
  processSequenceEmailsNow,
  resumeSequenceEnrollment,
  stopSequenceEnrollment,
  updateAutomationWorkflowStatus,
  updateEmailSequenceSettings,
  updateEmailSequenceStatus,
} from "@/actions/automations"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { HelpTip } from "@/components/ui/help-tip"

type AutomationData = Awaited<ReturnType<typeof import("@/actions/automations").getAutomationDashboard>>

const controlClass = "h-10 w-full rounded-[10px] border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/20"
const textAreaClass = "min-h-28 w-full rounded-[10px] border border-input bg-background p-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/20"
const STATUS_LABELS: Record<string, string> = { DRAFT: "Brouillon", ACTIVE: "Active", PAUSED: "En pause", ARCHIVED: "Archivée", COMPLETED: "Terminée", STOPPED: "Arrêtée", SENT: "Envoyé", FAILED: "Échec", SENDING: "En cours" }
const TRIGGER_LABELS: Record<string, string> = { LEAD_CREATED: "Prospect créé", LEAD_STATUS_CHANGED: "Statut prospect modifié", QUOTE_STATUS_CHANGED: "Statut devis modifié", EMAIL_RECEIVED: "E-mail reçu", EMAIL_OPENED: "E-mail ouvert", EMAIL_CLICKED: "Lien d’e-mail cliqué", PORTAL_APPOINTMENT_REQUESTED: "Rendez-vous demandé", INTERVENTION_COMPLETED: "Intervention terminée" }

export function AutomationCenter({ initialData }: { initialData: NonNullable<AutomationData> }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [previewTemplate, setPreviewTemplate] = useState<(typeof initialData.templates)[number] | null>(null)
  const [stepTypes, setStepTypes] = useState<Record<string, string>>({})
  const activeEnrollments = initialData.sequences.reduce((sum, sequence) => sum + sequence.enrollments.filter((item) => item.status === "ACTIVE").length, 0)

  function execute(operation: () => Promise<unknown>, success: string, form?: HTMLFormElement) {
    startTransition(async () => {
      try {
        await operation()
        form?.reset()
        toast.success(success)
        router.refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Action impossible")
      }
    })
  }

  function formNumber(form: FormData, key: string) {
    return Number(form.get(key) || 0)
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={Mail} label="Modèles" value={initialData.templates.length} />
        <Metric icon={Send} label="Séquences actives" value={initialData.sequences.filter((item) => item.status === "ACTIVE").length} />
        <Metric icon={Users} label="Prospects inscrits" value={activeEnrollments} />
        <Metric icon={Bot} label="Règles actives" value={initialData.workflows.filter((item) => item.status === "ACTIVE").length} />
      </div>

      <Tabs defaultValue="sequences" className="space-y-5">
        <TabsList className="h-auto max-w-full justify-start overflow-x-auto">
          <TabsTrigger value="sequences">Séquences</TabsTrigger>
          <TabsTrigger value="templates">Modèles</TabsTrigger>
          <TabsTrigger value="workflows">Règles</TabsTrigger>
          <TabsTrigger value="history">Journal</TabsTrigger>
        </TabsList>

        <TabsContent value="sequences" className="space-y-5">
          <Card>
            <CardHeader><CardTitle className="text-base">Nouvelle séquence</CardTitle><CardDescription>Une séquence reste en brouillon tant qu’elle n’a pas d’étape et n’est pas activée.</CardDescription></CardHeader>
            <CardContent><form className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto] md:items-end" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); execute(() => createEmailSequence({ name: form.get("name"), description: form.get("description") }), "Séquence créée.", event.currentTarget) }}>
              <Field label="Nom"><Input name="name" required placeholder="Relance après demande de devis" /></Field>
              <Field label="Description"><Input name="description" placeholder="Objectif et public de la séquence" /></Field>
              <Button type="submit" disabled={isPending}><Plus />Créer</Button>
            </form></CardContent>
          </Card>

          {initialData.sequences.length ? <div className="space-y-5">{initialData.sequences.map((sequence) => (
            <Card key={sequence.id}>
              <CardHeader className="border-b">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><CardTitle className="text-base">{sequence.name}</CardTitle><Badge variant={sequence.status === "ACTIVE" ? "default" : "outline"}>{STATUS_LABELS[sequence.status] ?? sequence.status}</Badge></div><CardDescription className="mt-1">{sequence.description || "Sans description"} · {sequence.steps.length} étape(s) · {sequence._count.enrollments} inscription(s)</CardDescription></div><div className="flex gap-2">{sequence.status === "ACTIVE" ? <Button size="sm" variant="outline" onClick={() => execute(() => updateEmailSequenceStatus(sequence.id, "PAUSED"), "Séquence mise en pause.")} disabled={isPending}><Pause />Pause</Button> : <Button size="sm" onClick={() => execute(() => updateEmailSequenceStatus(sequence.id, "ACTIVE"), "Séquence activée.")} disabled={isPending}><Play />Activer</Button>}</div></div>
              </CardHeader>
              <CardContent className="grid gap-6 pt-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
                <div className="space-y-4">
                  <details className="rounded-xl border bg-muted/20"><summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold">Cadence et fenêtre d’envoi <span className="ml-2 text-xs font-normal text-muted-foreground">{sequence.businessDaysOnly ? "jours ouvrés" : "tous les jours"} · {sequence.sendWindowStart} h–{sequence.sendWindowEnd} h · {sequence.timezone}</span></summary><form className="grid gap-3 border-t p-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); execute(() => updateEmailSequenceSettings({ sequenceId: sequence.id, businessDaysOnly: form.get("businessDaysOnly") === "on", sendWindowStart: formNumber(form, "sendWindowStart"), sendWindowEnd: formNumber(form, "sendWindowEnd"), timezone: form.get("timezone") }), "Cadence de la séquence mise à jour.") }}><label className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm"><input name="businessDaysOnly" type="checkbox" defaultChecked={sequence.businessDaysOnly} />Jours ouvrés uniquement</label><Field label="Début"><select name="sendWindowStart" defaultValue={sequence.sendWindowStart} className={controlClass}>{Array.from({ length: 17 }, (_, index) => index + 6).map((hour) => <option key={hour} value={hour}>{hour} h</option>)}</select></Field><Field label="Fin"><select name="sendWindowEnd" defaultValue={sequence.sendWindowEnd} className={controlClass}>{Array.from({ length: 17 }, (_, index) => index + 7).map((hour) => <option key={hour} value={hour}>{hour} h</option>)}</select></Field><Field label="Fuseau"><select name="timezone" defaultValue={sequence.timezone} className={controlClass}><option value="Europe/Paris">Europe/Paris</option><option value="Europe/Brussels">Europe/Bruxelles</option><option value="UTC">UTC</option></select></Field><div className="sm:col-span-2 lg:col-span-4"><Button type="submit" size="sm" variant="outline" disabled={isPending}>Enregistrer la cadence</Button></div></form></details>
                  <h3 className="text-sm font-semibold">Étapes</h3>
                  {sequence.steps.length ? <div className="space-y-2">{sequence.steps.map((step, index) => <div key={step.id} className="rounded-xl border p-4"><div className="flex items-center gap-2"><span className="grid size-7 place-items-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">{index + 1}</span>{step.type === "CALL_TASK" ? <PhoneCall className="size-4 text-primary" /> : step.type === "EMAIL" ? <Mail className="size-4 text-primary" /> : <CheckCircle2 className="size-4 text-primary" />}<p className="font-medium">{step.type === "EMAIL" ? step.subject : step.taskTitle}</p><Badge className="ml-auto" variant="outline"><Clock3 />{step.delayHours ? `${step.delayHours} h après` : "Immédiat"}</Badge></div>{step.type === "EMAIL" ? <><div className="mt-3 line-clamp-2 text-xs leading-5 text-muted-foreground" dangerouslySetInnerHTML={{ __html: step.bodyHtml.replace(/<[^>]+>/g, " ") }} /><StepPerformance deliveries={step.deliveries} /></> : <div className="mt-3"><p className="text-xs leading-5 text-muted-foreground">{step.taskNotes || "Aucune consigne complémentaire."}</p><div className="mt-3 flex flex-wrap gap-2 text-[11px]"><Badge variant="secondary">{step.type === "CALL_TASK" ? "Appel" : step.type === "MANUAL_EMAIL" ? "E-mail manuel" : "Tâche"}</Badge>{step.pauseUntilComplete && <Badge variant="outline">Attend la réalisation</Badge>}<Badge variant="outline">{step.taskExecutions.filter((item) => item.organisationTask.status === "DONE").length}/{step.taskExecutions.length} terminée(s)</Badge></div></div>}</div>)}</div> : <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">Aucune étape.</p>}
                  <form className="space-y-3 rounded-xl bg-muted/40 p-4" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const type = String(form.get("type") || "EMAIL"); execute(() => addEmailSequenceStep({ sequenceId: sequence.id, type, templateId: String(form.get("templateId") || "") || undefined, delayHours: formNumber(form, "delayHours"), subject: String(form.get("subject") || "") || undefined, bodyHtml: String(form.get("bodyHtml") || "") || undefined, taskTitle: String(form.get("taskTitle") || "") || undefined, taskNotes: String(form.get("taskNotes") || "") || undefined, taskPriority: formNumber(form, "taskPriority") || 2, pauseUntilComplete: form.get("pauseUntilComplete") === "on" }), "Étape ajoutée.", event.currentTarget) }}>
                    <div className="grid gap-3 sm:grid-cols-2"><Field label="Type d’étape"><select name="type" value={stepTypes[sequence.id] || "EMAIL"} onChange={(event) => setStepTypes((current) => ({ ...current, [sequence.id]: event.target.value }))} className={controlClass}><option value="EMAIL">E-mail automatique</option><option value="MANUAL_EMAIL">E-mail manuel</option><option value="CALL_TASK">Appel</option><option value="GENERAL_TASK">Tâche générale</option></select></Field><Field label="Délai après l’étape précédente (h)"><Input name="delayHours" type="number" min="0" max="8760" defaultValue="24" required /></Field></div>
                    {(stepTypes[sequence.id] || "EMAIL") === "EMAIL" ? <><Field label="Modèle facultatif"><select name="templateId" className={controlClass}><option value="">Contenu personnalisé</option>{initialData.templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></Field><Field label="Objet personnalisé"><Input name="subject" placeholder="Laissez vide si un modèle est choisi" /></Field><Field label="Contenu HTML personnalisé"><textarea name="bodyHtml" className={textAreaClass} placeholder={'<p>Bonjour {{contact.firstName}},</p><p>…</p>'} /></Field></> : <><Field label="Titre de la tâche"><Input name="taskTitle" required placeholder="Appeler {{contact.firstName}} au sujet du projet" /></Field><Field label="Consignes"><textarea name="taskNotes" className={textAreaClass} placeholder="Questions à poser, informations à confirmer…" /></Field><div className="grid gap-3 sm:grid-cols-2"><Field label="Priorité"><select name="taskPriority" defaultValue="2" className={controlClass}><option value="1">Haute</option><option value="2">Normale</option><option value="3">Basse</option></select></Field><label className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm"><input name="pauseUntilComplete" type="checkbox" defaultChecked />Attendre la réalisation avant la suite</label></div></>}
                    <Button type="submit" size="sm" variant="outline" disabled={isPending}><Plus />Ajouter l’étape</Button>
                  </form>
                </div>
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold">Inscriptions</h3>
                  <form className="space-y-3 rounded-xl border p-4" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); execute(() => enrollLeadInSequence(sequence.id, String(form.get("leadId"))), "Prospect inscrit.", event.currentTarget) }}><Field label="Prospect avec consentement actif"><select name="leadId" className={controlClass} required><option value="">Sélectionner…</option>{initialData.leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.firstName} {lead.lastName} · {lead.email}</option>)}</select></Field><Button type="submit" size="sm" disabled={isPending}><Users />Inscrire</Button></form>
                  {sequence.enrollments.length ? <div className="divide-y rounded-xl border">{sequence.enrollments.map((item) => <div key={item.id} className="flex items-center gap-3 p-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.leadCapture.firstName} {item.leadCapture.lastName}</p><p className="truncate text-xs text-muted-foreground">{item.leadCapture.email} · {STATUS_LABELS[item.status] ?? item.status}</p>{item.nextSendAt && <p className="mt-1 text-[11px] text-muted-foreground">Prochaine étape : {new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(item.nextSendAt))}</p>}{item.stopReason && <p className="mt-1 text-[11px] text-muted-foreground">Motif : {item.stopReason}</p>}{item.taskExecutions[0] && <p className="mt-1 text-[11px] text-muted-foreground">Dernière tâche : {item.taskExecutions[0].organisationTask.title} · {item.taskExecutions[0].organisationTask.status === "DONE" ? "terminée" : "à faire"}</p>}</div><div className="flex items-center gap-1">{item.status === "ACTIVE" && <Button size="icon-sm" variant="ghost" aria-label={`Mettre en pause ${item.leadCapture.firstName} ${item.leadCapture.lastName}`} title="Mettre en pause" onClick={() => execute(() => pauseSequenceEnrollment(item.id), "Inscription mise en pause.")}><Pause /></Button>}{item.status === "PAUSED" && <Button size="icon-sm" variant="ghost" aria-label={`Reprendre ${item.leadCapture.firstName} ${item.leadCapture.lastName}`} title="Reprendre" onClick={() => execute(() => resumeSequenceEnrollment(item.id), "Inscription reprise.")}><Play /></Button>}{["ACTIVE", "PAUSED"].includes(item.status) && <Button size="icon-sm" variant="ghost" aria-label={`Arrêter ${item.leadCapture.firstName} ${item.leadCapture.lastName}`} title="Arrêter" onClick={() => execute(() => stopSequenceEnrollment(item.id), "Inscription arrêtée.")}><Square /></Button>}</div></div>)}</div> : <p className="text-sm text-muted-foreground">Aucune inscription récente.</p>}
                </div>
              </CardContent>
            </Card>
          ))}</div> : <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Créez votre première séquence.</p>}
        </TabsContent>

        <TabsContent value="templates" className="grid gap-5 lg:grid-cols-[minmax(340px,0.75fr)_minmax(0,1.25fr)]">
          <Card><CardHeader><div className="flex items-center gap-2"><CardTitle className="text-base">Nouveau modèle</CardTitle><HelpTip label="Variables disponibles">Les variables sont remplacées au moment de l’envoi et échappées pour empêcher l’injection de contenu.</HelpTip></div><CardDescription>Variables : contact.firstName, contact.lastName, lead.projectType, lead.city, company.name.</CardDescription></CardHeader><CardContent><form className="space-y-4" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); execute(() => createEmailTemplate({ name: form.get("name"), category: form.get("category"), subject: form.get("subject"), bodyHtml: form.get("bodyHtml") }), "Modèle enregistré.", event.currentTarget) }}><Field label="Nom"><Input name="name" required /></Field><Field label="Catégorie"><select name="category" className={controlClass}><option value="NURTURE">Suivi commercial</option><option value="QUOTE">Devis</option><option value="SERVICE">Service</option><option value="EVENT">Actualité</option></select></Field><Field label="Objet"><Input name="subject" required placeholder="Votre projet {{lead.projectType}}" /></Field><Field label="Contenu HTML"><textarea name="bodyHtml" required className={textAreaClass} defaultValue={'<p>Bonjour {{contact.firstName}},</p><p>Nous revenons vers vous au sujet de votre projet.</p>'} /></Field><Button type="submit" disabled={isPending}><Plus />Enregistrer</Button></form></CardContent></Card>
          <div className="space-y-3">{initialData.templates.map((template) => <Card key={template.id}><CardHeader><div className="flex items-center justify-between gap-3"><div><CardTitle className="text-sm">{template.name}</CardTitle><CardDescription>{template.category}</CardDescription></div><Badge variant="outline">{template.status}</Badge></div></CardHeader><CardContent><p className="text-sm font-medium">{template.subject}</p><p className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground">{template.bodyHtml.replace(/<[^>]+>/g, " ")}</p><Button className="mt-3" size="sm" variant="outline" onClick={() => setPreviewTemplate(template)}><Eye />Voir l’aperçu HTML</Button></CardContent></Card>)}{!initialData.templates.length ? <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Aucun modèle.</p> : null}</div>
        </TabsContent>

        <TabsContent value="workflows" className="space-y-5">
          <Card><CardHeader><CardTitle className="text-base">Nouvelle règle</CardTitle><CardDescription>Chaque événement possède une clé d’idempotence : une même règle ne s’exécute pas deux fois pour le même changement.</CardDescription></CardHeader><CardContent><form className="grid gap-4 lg:grid-cols-3" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const actionType = String(form.get("actionType")); const action = actionType === "ENROLL_SEQUENCE" ? { type: actionType, sequenceId: String(form.get("sequenceId")) } : actionType === "CREATE_TASK" ? { type: actionType, title: String(form.get("actionTitle")), delayHours: formNumber(form, "delayHours"), priority: 2 } : actionType === "UPDATE_LEAD_STATUS" ? { type: actionType, status: String(form.get("targetLeadStatus")) } : { type: actionType, title: String(form.get("actionTitle")) }; const source = String(form.get("source") || ""); const leadStatus = String(form.get("leadStatus") || ""); execute(() => createAutomationWorkflow({ name: form.get("name"), trigger: form.get("trigger"), conditions: { ...(source ? { source } : {}), ...(leadStatus ? { leadStatus } : {}) }, actions: [action] }), "Règle créée en brouillon.", event.currentTarget) }}>
            <Field label="Nom"><Input name="name" required placeholder="Qualifier les demandes du site" /></Field><Field label="Déclencheur"><select name="trigger" className={controlClass}>{Object.entries(TRIGGER_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="Source (facultatif)"><Input name="source" placeholder="WEBSITE" /></Field><Field label="Statut prospect (facultatif)"><select name="leadStatus" className={controlClass}><option value="">Tous</option><option value="NEW">Nouveau</option><option value="CONTACTED">Contacté</option><option value="QUALIFIED">Qualifié</option></select></Field><Field label="Action"><select name="actionType" className={controlClass}><option value="ENROLL_SEQUENCE">Inscrire dans une séquence</option><option value="CREATE_TASK">Créer une tâche</option><option value="NOTIFY_TEAM">Notifier l’équipe</option><option value="UPDATE_LEAD_STATUS">Modifier le statut prospect</option></select></Field><Field label="Séquence"><select name="sequenceId" className={controlClass}><option value="">Sélectionner…</option>{initialData.sequences.map((sequence) => <option key={sequence.id} value={sequence.id}>{sequence.name}</option>)}</select></Field><Field label="Titre tâche / notification"><Input name="actionTitle" defaultValue="Suivre {{contact.firstName}} {{contact.lastName}}" /></Field><Field label="Nouveau statut prospect"><select name="targetLeadStatus" className={controlClass}><option value="CONTACTED">Contacté</option><option value="QUALIFIED">Qualifié</option><option value="ARCHIVED">Archivé</option></select></Field><Field label="Délai tâche (h)"><Input name="delayHours" type="number" min="0" defaultValue="24" /></Field><div className="flex items-end"><Button type="submit" disabled={isPending}><Bot />Créer la règle</Button></div>
          </form></CardContent></Card>
          <div className="grid gap-4 lg:grid-cols-2">{initialData.workflows.map((workflow) => <Card key={workflow.id}><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle className="text-sm">{workflow.name}</CardTitle><CardDescription>{TRIGGER_LABELS[workflow.trigger] ?? workflow.trigger}</CardDescription></div><Badge variant={workflow.status === "ACTIVE" ? "default" : "outline"}>{STATUS_LABELS[workflow.status] ?? workflow.status}</Badge></div></CardHeader><CardContent className="space-y-3"><p className="text-xs text-muted-foreground">{workflow.runs.length} exécution(s) récente(s) · {workflow.runs.filter((run) => run.status === "FAILED").length} échec(s)</p>{workflow.status === "ACTIVE" ? <Button size="sm" variant="outline" onClick={() => execute(() => updateAutomationWorkflowStatus(workflow.id, "PAUSED"), "Règle mise en pause.")}><Pause />Pause</Button> : <Button size="sm" onClick={() => execute(() => updateAutomationWorkflowStatus(workflow.id, "ACTIVE"), "Règle activée.")}><Play />Activer</Button>}</CardContent></Card>)}{!initialData.workflows.length ? <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground lg:col-span-2">Aucune règle.</p> : null}</div>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <div className="flex items-center justify-between gap-4 rounded-xl border bg-card p-4"><div><p className="text-sm font-semibold">Traitement des envois dus</p><p className="mt-1 text-xs text-muted-foreground">Le worker le fait automatiquement chaque minute. Ce bouton sert à la recette ou au rattrapage.</p></div><Button variant="outline" disabled={isPending} onClick={() => execute(async () => { const result = await processSequenceEmailsNow(); toast.message(`${result.summary.sent} envoyé(s), ${result.summary.failed} échec(s).`) }, "Traitement terminé.")}><Activity />Exécuter</Button></div>
          <div className="overflow-hidden rounded-xl border bg-card"><div className="grid grid-cols-[minmax(0,1fr)_130px_110px] gap-3 border-b bg-muted/40 px-4 py-3 text-xs font-semibold text-muted-foreground"><span>Destinataire / objet</span><span>Séquence</span><span>État</span></div>{initialData.deliveries.length ? <div className="divide-y">{initialData.deliveries.map((delivery) => <div key={delivery.id} className="grid grid-cols-[minmax(0,1fr)_130px_110px] gap-3 px-4 py-3 text-sm"><span className="min-w-0"><span className="block truncate font-medium">{delivery.subject}</span><span className="block truncate text-xs text-muted-foreground">{delivery.recipientEmail}</span></span><span className="truncate text-xs text-muted-foreground">{delivery.sequence?.name || "—"}</span><Badge variant={delivery.status === "SENT" ? "secondary" : delivery.status === "FAILED" ? "destructive" : "outline"}>{delivery.status === "SENT" ? <CheckCircle2 /> : null}{STATUS_LABELS[delivery.status] ?? delivery.status}</Badge></div>)}</div> : <p className="p-8 text-center text-sm text-muted-foreground">Aucun envoi.</p>}</div>
        </TabsContent>
      </Tabs>
      <Dialog open={Boolean(previewTemplate)} onOpenChange={(open) => { if (!open) setPreviewTemplate(null) }}><DialogContent className="sm:max-w-3xl"><DialogHeader><DialogTitle>{previewTemplate?.name}</DialogTitle><DialogDescription>{previewTemplate?.subject}</DialogDescription></DialogHeader><iframe title="Aperçu HTML du modèle" sandbox="" srcDoc={`<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: cid:; style-src 'unsafe-inline'"><style>body{font-family:Arial,sans-serif;line-height:1.55;color:#182230;margin:24px}a{color:#1768ff}</style></head><body>${previewTemplate?.bodyHtml ?? ""}</body></html>`} className="h-[600px] w-full rounded-xl border bg-white" /></DialogContent></Dialog>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1.5"><span className="block text-xs font-semibold">{label}</span>{children}</label>
}

function Metric({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value: number }) {
  return <Card><CardContent className="flex items-center gap-4 p-5"><span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="size-4" /></span><div><p className="text-2xl font-semibold tabular-nums">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div></CardContent></Card>
}

function StepPerformance({ deliveries }: { deliveries: Array<{ status: string }> }) {
  const delivered = deliveries.filter((item) => ["DELIVERED", "OPENED", "CLICKED"].includes(item.status)).length
  const opened = deliveries.filter((item) => ["OPENED", "CLICKED"].includes(item.status)).length
  const clicked = deliveries.filter((item) => item.status === "CLICKED").length
  const errors = deliveries.filter((item) => ["FAILED", "BOUNCED", "COMPLAINED", "SUPPRESSED"].includes(item.status)).length
  return <div className="mt-3 grid grid-cols-4 gap-2 border-t pt-3 text-center"><span><strong className="block text-sm tabular-nums">{delivered}</strong><span className="text-[10px] text-muted-foreground">Livrés</span></span><span><strong className="block text-sm tabular-nums">{opened}</strong><span className="text-[10px] text-muted-foreground">Ouverts</span></span><span><strong className="block text-sm tabular-nums">{clicked}</strong><span className="text-[10px] text-muted-foreground">Cliqués</span></span><span><strong className={`block text-sm tabular-nums ${errors ? "text-danger" : ""}`}>{errors}</strong><span className="text-[10px] text-muted-foreground">Erreurs</span></span></div>
}
