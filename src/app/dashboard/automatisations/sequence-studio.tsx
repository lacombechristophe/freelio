"use client"

import { useMemo, useState } from "react"
import {
  Archive,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Clock3,
  Copy,
  FilePenLine,
  LockKeyhole,
  Mail,
  Pause,
  PhoneCall,
  Play,
  Plus,
  Search,
  Send,
  Settings2,
  Square,
  Trash2,
  Users,
} from "lucide-react"

import {
  addEmailSequenceStep,
  createEmailSequence,
  deleteEmailSequenceStep,
  duplicateEmailSequence,
  enrollLeadInSequence,
  moveEmailSequenceStep,
  pauseSequenceEnrollment,
  resumeSequenceEnrollment,
  stopSequenceEnrollment,
  updateEmailSequence,
  updateEmailSequenceSettings,
  updateEmailSequenceStatus,
} from "@/actions/automations"
import type { AutomationData, AutomationRunner, AutomationSequence } from "@/app/dashboard/automatisations/automation-model"
import { controlClass, formatAutomationDate, plainTextFromHtml, STATUS_LABELS, STEP_LABELS, textAreaClass } from "@/app/dashboard/automatisations/automation-model"
import { EmptyState } from "@/components/shared/empty-state"
import { useConfirm } from "@/components/shared/confirm-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { HelpTip } from "@/components/ui/help-tip"
import { Input } from "@/components/ui/input"

type DeliveryStats = Record<string, number>

function countDeliveryStatuses(stats: DeliveryStats, statuses: string[]) {
  return statuses.reduce((total, status) => total + (stats[status] ?? 0), 0)
}

export function SequenceStudio({ data, pending, run }: { data: AutomationData; pending: boolean; run: AutomationRunner }) {
  const confirm = useConfirm()
  const [selectedId, setSelectedId] = useState(data.sequences[0]?.id ?? "")
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState("ALL")
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [stepOpen, setStepOpen] = useState(false)
  const [stepType, setStepType] = useState("EMAIL")

  const filtered = useMemo(
    () =>
      data.sequences.filter((sequence) => {
        const matchesQuery = `${sequence.name} ${sequence.description || ""}`.toLocaleLowerCase("fr").includes(query.trim().toLocaleLowerCase("fr"))
        return matchesQuery && (status === "ALL" || sequence.status === status)
      }),
    [data.sequences, query, status],
  )
  const selected = data.sequences.find((sequence) => sequence.id === selectedId) ?? filtered[0] ?? data.sequences[0]

  async function archiveSequence(sequence: AutomationSequence) {
    const accepted = await confirm({
      title: "Archiver cette séquence ?",
      description: "Elle disparaîtra du studio. Les inscriptions actives ou en pause doivent d’abord être arrêtées.",
      confirmLabel: "Archiver",
      destructive: true,
    })
    if (accepted) run(() => updateEmailSequenceStatus(sequence.id, "ARCHIVED"), "Séquence archivée.")
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher une séquence…" className="pl-9" aria-label="Rechercher une séquence" />
        </div>
        <select value={status} onChange={(event) => setStatus(event.target.value)} className={`${controlClass} sm:w-44`} aria-label="Filtrer par état">
          <option value="ALL">Tous les états</option>
          <option value="DRAFT">Brouillons</option>
          <option value="ACTIVE">Actives</option>
          <option value="PAUSED">En pause</option>
        </select>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus />
          Nouvelle séquence
        </Button>
      </div>

      {data.sequences.length ? (
        <div className="grid min-h-[680px] overflow-hidden rounded-xl border bg-card xl:grid-cols-[310px_minmax(0,1fr)]">
          <aside className="border-b xl:border-b-0 xl:border-r" aria-label="Liste des séquences">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div>
                <p className="text-sm font-semibold">Bibliothèque</p>
                <p className="text-xs text-muted-foreground">{filtered.length} résultat(s)</p>
              </div>
              <Send className="size-4 text-muted-foreground" />
            </div>
            <div className="max-h-[680px] overflow-y-auto p-2">
              {filtered.length ? (
                filtered.map((sequence) => (
                  <SequenceListItem key={sequence.id} sequence={sequence} active={selected?.id === sequence.id} onSelect={() => setSelectedId(sequence.id)} />
                ))
              ) : (
                <p className="px-3 py-10 text-center text-sm text-muted-foreground">Aucune séquence ne correspond aux filtres.</p>
              )}
            </div>
          </aside>
          {selected ? (
            <SequenceDetail
              sequence={selected}
              data={data}
              pending={pending}
              run={run}
              onEdit={() => setEditOpen(true)}
              onAddStep={() => setStepOpen(true)}
              onArchive={() => archiveSequence(selected)}
            />
          ) : null}
        </div>
      ) : (
        <div className="rounded-xl border bg-card">
          <EmptyState
            icon={Send}
            title="Créez votre première séquence"
            description="Assemblez e-mails, appels et tâches, puis inscrivez uniquement les prospects disposant d’un consentement actif."
            action={
              <Button onClick={() => setCreateOpen(true)}>
                <Plus />
                Créer une séquence
              </Button>
            }
          />
        </div>
      )}

      <SequenceFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Nouvelle séquence"
        description="Commencez par l’objectif. La cadence et les étapes se règlent ensuite dans le studio."
        pending={pending}
        onSubmit={(form, element) =>
          run(() => createEmailSequence({ name: form.get("name"), description: form.get("description") }), "Séquence créée.", { form: element, after: () => setCreateOpen(false) })
        }
      />
      {selected && (
        <SequenceFormDialog
          key={`edit-${selected.id}`}
          open={editOpen}
          onOpenChange={setEditOpen}
          title="Modifier la séquence"
          description="Le nom et la description restent modifiables sans altérer les inscriptions."
          pending={pending}
          sequence={selected}
          onSubmit={(form) =>
            run(() => updateEmailSequence({ id: selected.id, name: form.get("name"), description: form.get("description") }), "Séquence mise à jour.", {
              after: () => setEditOpen(false),
            })
          }
        />
      )}
      {selected && (
        <StepDialog
          key={`step-${selected.id}`}
          open={stepOpen}
          onOpenChange={setStepOpen}
          sequence={selected}
          data={data}
          pending={pending}
          run={run}
          type={stepType}
          onTypeChange={setStepType}
        />
      )}
    </div>
  )
}

function SequenceListItem({ sequence, active, onSelect }: { sequence: AutomationSequence; active: boolean; onSelect: () => void }) {
  const activeEnrollments = sequence.enrollments.filter((item) => item.status === "ACTIVE").length
  const errors = sequence.steps.reduce((total, step) => total + countDeliveryStatuses(step.deliveryStats, ["FAILED", "BOUNCED", "COMPLAINED", "SUPPRESSED"]), 0)
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`mb-1 w-full rounded-lg px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? "bg-primary/[0.07]" : "hover:bg-muted/60"}`}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{sequence.name}</span>
          <span className="mt-1 block truncate text-xs text-muted-foreground">
            {sequence.steps.length} étape(s) · {activeEnrollments} en cours
          </span>
        </span>
        <Badge variant={sequence.status === "ACTIVE" ? "default" : "outline"}>{STATUS_LABELS[sequence.status] ?? sequence.status}</Badge>
      </span>
      {errors > 0 && <span className="mt-2 block text-xs font-medium text-destructive">{errors} incident(s) d’envoi</span>}
    </button>
  )
}

function SequenceDetail({
  sequence,
  data,
  pending,
  run,
  onEdit,
  onAddStep,
  onArchive,
}: {
  sequence: AutomationSequence
  data: AutomationData
  pending: boolean
  run: AutomationRunner
  onEdit: () => void
  onAddStep: () => void
  onArchive: () => void
}) {
  const mutableSteps = sequence.status !== "ACTIVE" && sequence._count.enrollments === 0
  const activeEnrollments = sequence.enrollments.filter((item) => item.status === "ACTIVE").length
  const delivered = sequence.steps.reduce((total, step) => total + countDeliveryStatuses(step.deliveryStats, ["DELIVERED", "OPENED", "CLICKED"]), 0)
  const opened = sequence.steps.reduce((total, step) => total + countDeliveryStatuses(step.deliveryStats, ["OPENED", "CLICKED"]), 0)

  return (
    <section className="min-w-0">
      <header className="border-b px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-semibold">{sequence.name}</h2>
              <Badge variant={sequence.status === "ACTIVE" ? "default" : "outline"}>{STATUS_LABELS[sequence.status] ?? sequence.status}</Badge>
              {!mutableSteps && (
                <Badge variant="secondary">
                  <LockKeyhole />
                  Étapes figées
                </Badge>
              )}
            </div>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              {sequence.description || "Ajoutez une description pour rappeler l’objectif et le public de cette séquence."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={onEdit}>
              <FilePenLine />
              Modifier
            </Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => duplicateEmailSequence(sequence.id), "Copie créée en brouillon.")}>
              <Copy />
              Dupliquer
            </Button>
            {sequence.status === "ACTIVE" ? (
              <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => updateEmailSequenceStatus(sequence.id, "PAUSED"), "Séquence mise en pause.")}>
                <Pause />
                Mettre en pause
              </Button>
            ) : (
              <Button size="sm" disabled={pending || !sequence.steps.length} onClick={() => run(() => updateEmailSequenceStatus(sequence.id, "ACTIVE"), "Séquence activée.")}>
                <Play />
                Activer
              </Button>
            )}
            <Button size="icon-sm" variant="ghost" aria-label={`Archiver ${sequence.name}`} title="Archiver" disabled={pending} onClick={onArchive}>
              <Archive />
            </Button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t pt-4 text-xs text-muted-foreground">
          <span>
            <strong className="text-foreground">{sequence.steps.length}</strong> étape(s)
          </span>
          <span>
            <strong className="text-foreground">{activeEnrollments}</strong> inscription(s) active(s)
          </span>
          <span>
            <strong className="text-foreground">{delivered ? Math.round((opened / delivered) * 100) : 0} %</strong> d’ouverture
          </span>
          <span>Mis à jour {formatAutomationDate(sequence.updatedAt)}</span>
        </div>
      </header>

      <div className="grid gap-0 2xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5 p-4 sm:p-5 2xl:border-r">
          <details className="rounded-lg border bg-muted/15">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 px-3 py-2 text-sm font-medium">
              <Settings2 className="size-4 text-primary" />
              <span className="flex-1">Cadence et fenêtre d’envoi</span>
              <span className="text-xs font-normal text-muted-foreground">
                {sequence.businessDaysOnly ? "jours ouvrés" : "tous les jours"} · {sequence.sendWindowStart} h–{sequence.sendWindowEnd} h
              </span>
            </summary>
            <form
              className="grid gap-3 border-t p-4 sm:grid-cols-2 lg:grid-cols-4"
              onSubmit={(event) => {
                event.preventDefault()
                const form = new FormData(event.currentTarget)
                run(
                  () =>
                    updateEmailSequenceSettings({
                      sequenceId: sequence.id,
                      businessDaysOnly: form.get("businessDaysOnly") === "on",
                      sendWindowStart: Number(form.get("sendWindowStart")),
                      sendWindowEnd: Number(form.get("sendWindowEnd")),
                      timezone: form.get("timezone"),
                    }),
                  "Cadence enregistrée.",
                )
              }}
            >
              <label className="flex min-h-10 items-center gap-2 rounded-lg border bg-background px-3 text-sm">
                <input name="businessDaysOnly" type="checkbox" defaultChecked={sequence.businessDaysOnly} />
                Jours ouvrés
              </label>
              <Field label="Début">
                <select name="sendWindowStart" defaultValue={sequence.sendWindowStart} className={controlClass}>
                  {Array.from({ length: 23 }, (_, index) => (
                    <option key={index} value={index}>
                      {index} h
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Fin">
                <select name="sendWindowEnd" defaultValue={sequence.sendWindowEnd} className={controlClass}>
                  {Array.from({ length: 23 }, (_, index) => index + 1).map((hour) => (
                    <option key={hour} value={hour}>
                      {hour} h
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Fuseau">
                <select name="timezone" defaultValue={sequence.timezone} className={controlClass}>
                  <option value="Europe/Paris">Europe/Paris</option>
                  <option value="Europe/Brussels">Europe/Bruxelles</option>
                  <option value="UTC">UTC</option>
                </select>
              </Field>
              <div className="sm:col-span-2 lg:col-span-4">
                <Button type="submit" size="sm" variant="outline" disabled={pending}>
                  Enregistrer la cadence
                </Button>
              </div>
            </form>
          </details>

          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Parcours</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">Le délai est calculé après l’étape précédente.</p>
              </div>
              <div className="flex items-center gap-2">
                <HelpTip label="Règle de modification">
                  Une séquence ayant déjà inscrit un prospect conserve ses étapes pour assurer la traçabilité. Dupliquez-la pour produire une nouvelle version.
                </HelpTip>
                <Button size="sm" variant="outline" onClick={onAddStep} disabled={!mutableSteps}>
                  <Plus />
                  Ajouter une étape
                </Button>
              </div>
            </div>
            {sequence.steps.length ? (
              <ol className="space-y-0">
                {sequence.steps.map((step, index) => (
                  <SequenceStepRow key={step.id} step={step} index={index} total={sequence.steps.length} mutable={mutableSteps} pending={pending} run={run} />
                ))}
              </ol>
            ) : (
              <div className="rounded-lg border border-dashed px-5 py-10 text-center">
                <Send className="mx-auto size-7 text-muted-foreground" />
                <p className="mt-3 text-sm font-medium">Le parcours est vide</p>
                <p className="mt-1 text-xs text-muted-foreground">Ajoutez un e-mail, un appel ou une tâche pour pouvoir activer la séquence.</p>
              </div>
            )}
          </div>
        </div>

        <aside className="space-y-5 p-4 sm:p-5">
          <div>
            <h3 className="text-sm font-semibold">Inscrire un prospect</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Seuls les prospects avec adresse e-mail et consentement actif sont proposés.</p>
          </div>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault()
              const form = new FormData(event.currentTarget)
              run(() => enrollLeadInSequence(sequence.id, String(form.get("leadId"))), "Prospect inscrit.", { form: event.currentTarget })
            }}
          >
            <Field label="Prospect">
              <select name="leadId" className={controlClass} required>
                <option value="">Sélectionner…</option>
                {data.leads.map((lead) => (
                  <option key={lead.id} value={lead.id}>
                    {lead.firstName} {lead.lastName} · {lead.email}
                  </option>
                ))}
              </select>
            </Field>
            <Button type="submit" size="sm" disabled={pending || !sequence.steps.length || sequence.status !== "ACTIVE"}>
              <Users />
              Inscrire
            </Button>
            {sequence.status !== "ACTIVE" && <p className="text-xs text-amber-700 dark:text-amber-300">Activez la séquence avant l’inscription.</p>}
          </form>
          <div className="border-t pt-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Inscriptions récentes</h3>
              <Badge variant="secondary">{sequence._count.enrollments}</Badge>
            </div>
            {sequence.enrollments.length ? (
              <div className="divide-y">
                {sequence.enrollments.map((enrollment) => (
                  <EnrollmentRow key={enrollment.id} enrollment={enrollment} pending={pending} run={run} />
                ))}
              </div>
            ) : (
              <p className="rounded-lg bg-muted/35 px-3 py-4 text-xs leading-5 text-muted-foreground">Aucun prospect inscrit pour le moment.</p>
            )}
          </div>
        </aside>
      </div>
    </section>
  )
}

function SequenceStepRow({
  step,
  index,
  total,
  mutable,
  pending,
  run,
}: {
  step: AutomationSequence["steps"][number]
  index: number
  total: number
  mutable: boolean
  pending: boolean
  run: AutomationRunner
}) {
  const Icon = step.type === "EMAIL" ? Mail : step.type === "CALL_TASK" ? PhoneCall : CheckCircle2
  const title = step.type === "EMAIL" ? step.subject : step.taskTitle || STEP_LABELS[step.type] || step.type
  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      <div className="flex w-9 shrink-0 flex-col items-center">
        <span className="z-10 grid size-9 place-items-center rounded-lg border bg-card text-primary">
          <Icon className="size-4" />
        </span>
        {index < total - 1 && <span className="h-full w-px bg-border" />}
      </div>
      <div className="min-w-0 flex-1 rounded-lg border p-3.5">
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Étape {index + 1}</Badge>
              <span className="text-xs text-muted-foreground">{STEP_LABELS[step.type] ?? step.type}</span>
            </div>
            <p className="mt-2 break-words text-sm font-medium">{title}</p>
          </div>
          <Badge variant="outline">
            <Clock3 />
            {step.delayHours ? `${step.delayHours} h après` : "Immédiat"}
          </Badge>
        </div>
        {step.type === "EMAIL" ? (
          <>
            <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{plainTextFromHtml(step.bodyHtml) || "Aucun contenu"}</p>
            <StepPerformance stats={step.deliveryStats} />
          </>
        ) : (
          <>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{step.taskNotes || "Aucune consigne complémentaire."}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant="outline">Priorité {step.taskPriority}</Badge>
              {step.pauseUntilComplete && <Badge variant="outline">Attend la réalisation</Badge>}
            </div>
          </>
        )}
        {mutable && (
          <div className="mt-3 flex justify-end gap-1 border-t pt-2">
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label={`Monter l’étape ${index + 1}`}
              disabled={pending || index === 0}
              onClick={() => run(() => moveEmailSequenceStep(step.id, "UP"), "Étape déplacée.")}
            >
              <ArrowUp />
            </Button>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label={`Descendre l’étape ${index + 1}`}
              disabled={pending || index === total - 1}
              onClick={() => run(() => moveEmailSequenceStep(step.id, "DOWN"), "Étape déplacée.")}
            >
              <ArrowDown />
            </Button>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label={`Supprimer l’étape ${index + 1}`}
              disabled={pending}
              onClick={() => run(() => deleteEmailSequenceStep(step.id), "Étape supprimée.")}
            >
              <Trash2 className="text-destructive" />
            </Button>
          </div>
        )}
      </div>
    </li>
  )
}

function EnrollmentRow({ enrollment, pending, run }: { enrollment: AutomationSequence["enrollments"][number]; pending: boolean; run: AutomationRunner }) {
  return (
    <div className="flex items-start gap-2 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {enrollment.leadCapture.firstName} {enrollment.leadCapture.lastName}
        </p>
        <p className="truncate text-xs text-muted-foreground">{enrollment.leadCapture.email}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {STATUS_LABELS[enrollment.status] ?? enrollment.status}
          {enrollment.nextSendAt ? ` · prochaine étape ${formatAutomationDate(enrollment.nextSendAt)}` : ""}
        </p>
        {enrollment.stopReason && <p className="mt-1 text-[11px] text-destructive">Motif : {enrollment.stopReason}</p>}
      </div>
      <div className="flex shrink-0 gap-1">
        {enrollment.status === "ACTIVE" && (
          <Button
            size="icon-xs"
            variant="ghost"
            disabled={pending}
            aria-label={`Mettre en pause ${enrollment.leadCapture.firstName} ${enrollment.leadCapture.lastName}`}
            onClick={() => run(() => pauseSequenceEnrollment(enrollment.id), "Inscription mise en pause.")}
          >
            <Pause />
          </Button>
        )}
        {enrollment.status === "PAUSED" && (
          <Button
            size="icon-xs"
            variant="ghost"
            disabled={pending}
            aria-label={`Reprendre ${enrollment.leadCapture.firstName} ${enrollment.leadCapture.lastName}`}
            onClick={() => run(() => resumeSequenceEnrollment(enrollment.id), "Inscription reprise.")}
          >
            <Play />
          </Button>
        )}
        {["ACTIVE", "PAUSED"].includes(enrollment.status) && (
          <Button
            size="icon-xs"
            variant="ghost"
            disabled={pending}
            aria-label={`Arrêter ${enrollment.leadCapture.firstName} ${enrollment.leadCapture.lastName}`}
            onClick={() => run(() => stopSequenceEnrollment(enrollment.id), "Inscription arrêtée.")}
          >
            <Square />
          </Button>
        )}
      </div>
    </div>
  )
}

function StepPerformance({ stats }: { stats: DeliveryStats }) {
  const total = Object.values(stats).reduce((sum, count) => sum + count, 0)
  const delivered = countDeliveryStatuses(stats, ["DELIVERED", "OPENED", "CLICKED"])
  const opened = countDeliveryStatuses(stats, ["OPENED", "CLICKED"])
  const clicked = stats.CLICKED ?? 0
  const errors = countDeliveryStatuses(stats, ["FAILED", "BOUNCED", "COMPLAINED", "SUPPRESSED"])
  if (!total) return <p className="mt-3 border-t pt-2 text-[11px] text-muted-foreground">Aucune donnée d’envoi pour cette étape.</p>
  return (
    <div className="mt-3 grid grid-cols-4 gap-2 border-t pt-3 text-center">
      <span>
        <strong className="block text-sm tabular-nums">{delivered}</strong>
        <span className="text-[10px] text-muted-foreground">Livrés</span>
      </span>
      <span>
        <strong className="block text-sm tabular-nums">{opened}</strong>
        <span className="text-[10px] text-muted-foreground">Ouverts</span>
      </span>
      <span>
        <strong className="block text-sm tabular-nums">{clicked}</strong>
        <span className="text-[10px] text-muted-foreground">Cliqués</span>
      </span>
      <span>
        <strong className={`block text-sm tabular-nums ${errors ? "text-destructive" : ""}`}>{errors}</strong>
        <span className="text-[10px] text-muted-foreground">Erreurs</span>
      </span>
    </div>
  )
}

function SequenceFormDialog({
  open,
  onOpenChange,
  title,
  description,
  pending,
  sequence,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  pending: boolean
  sequence?: AutomationSequence
  onSubmit: (form: FormData, element: HTMLFormElement) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          id="sequence-form"
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit(new FormData(event.currentTarget), event.currentTarget)
          }}
        >
          <Field label="Nom">
            <Input name="name" required minLength={2} maxLength={120} defaultValue={sequence?.name} placeholder="Relance après demande de devis" />
          </Field>
          <Field label="Description">
            <textarea name="description" maxLength={500} defaultValue={sequence?.description || ""} className={textAreaClass} placeholder="Objectif, public et résultat attendu" />
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="submit" form="sequence-form" disabled={pending}>
            {sequence ? "Enregistrer" : "Créer la séquence"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function StepDialog({
  open,
  onOpenChange,
  sequence,
  data,
  pending,
  run,
  type,
  onTypeChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sequence: AutomationSequence
  data: AutomationData
  pending: boolean
  run: AutomationRunner
  type: string
  onTypeChange: (type: string) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Ajouter une étape</DialogTitle>
          <DialogDescription>Définissez l’action et le délai relatif. Le moteur respectera ensuite la fenêtre d’envoi de la séquence.</DialogDescription>
        </DialogHeader>
        <form
          id="sequence-step-form"
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            const form = new FormData(event.currentTarget)
            run(
              () =>
                addEmailSequenceStep({
                  sequenceId: sequence.id,
                  type: form.get("type"),
                  templateId: String(form.get("templateId") || "") || undefined,
                  delayHours: Number(form.get("delayHours")),
                  subject: String(form.get("subject") || "") || undefined,
                  bodyHtml: String(form.get("bodyHtml") || "") || undefined,
                  taskTitle: String(form.get("taskTitle") || "") || undefined,
                  taskNotes: String(form.get("taskNotes") || "") || undefined,
                  taskPriority: Number(form.get("taskPriority") || 2),
                  pauseUntilComplete: form.get("pauseUntilComplete") === "on",
                }),
              "Étape ajoutée.",
              { form: event.currentTarget, after: () => onOpenChange(false) },
            )
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type">
              <select name="type" value={type} onChange={(event) => onTypeChange(event.target.value)} className={controlClass}>
                <option value="EMAIL">E-mail automatique</option>
                <option value="MANUAL_EMAIL">E-mail manuel</option>
                <option value="CALL_TASK">Appel</option>
                <option value="GENERAL_TASK">Tâche générale</option>
              </select>
            </Field>
            <Field label="Délai après l’étape précédente">
              <div className="relative">
                <Input name="delayHours" type="number" min="0" max="8760" defaultValue="24" required className="pr-12" />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">heures</span>
              </div>
            </Field>
          </div>
          {type === "EMAIL" ? (
            <>
              <Field label="Partir d’un modèle">
                <select name="templateId" className={controlClass}>
                  <option value="">Contenu personnalisé</option>
                  {data.templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Objet personnalisé">
                <Input name="subject" maxLength={180} placeholder="Laissez vide si un modèle est choisi" />
              </Field>
              <Field label="Contenu HTML personnalisé">
                <textarea
                  name="bodyHtml"
                  maxLength={50000}
                  className={`${textAreaClass} min-h-40 font-mono text-xs`}
                  placeholder={"<p>Bonjour {{contact.firstName}},</p><p>…</p>"}
                />
              </Field>
            </>
          ) : (
            <>
              <Field label="Titre de la tâche">
                <Input name="taskTitle" required maxLength={180} placeholder="Appeler {{contact.firstName}} au sujet du projet" />
              </Field>
              <Field label="Consignes">
                <textarea name="taskNotes" maxLength={2000} className={textAreaClass} placeholder="Questions à poser, informations à confirmer…" />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Priorité">
                  <select name="taskPriority" defaultValue="2" className={controlClass}>
                    <option value="1">Haute</option>
                    <option value="2">Normale</option>
                    <option value="3">Basse</option>
                  </select>
                </Field>
                <label className="flex min-h-10 items-center gap-2 rounded-lg border bg-background px-3 text-sm">
                  <input name="pauseUntilComplete" type="checkbox" defaultChecked />
                  Attendre la réalisation
                </label>
              </div>
            </>
          )}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="submit" form="sequence-step-form" disabled={pending}>
            <Plus />
            Ajouter l’étape
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-xs font-semibold">{label}</span>
      {children}
    </label>
  )
}
