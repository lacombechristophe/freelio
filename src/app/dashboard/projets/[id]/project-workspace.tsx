"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { CalendarRange, FileText, Link2, Plus, Ruler, Settings2, ShieldCheck, Trash2, Upload, UserRound } from "lucide-react"
import { toast } from "sonner"
import { isReadOnlyDemo } from "@/lib/demo-mode"
import { uploadResourceFile } from "@/lib/client-file-upload"
import {
  createProjectAcceptanceItem,
  createProjectMilestone,
  deleteProjectAcceptanceItem,
  deleteProjectMilestone,
  updateProjectAcceptanceStatus,
  updateProjectMilestoneStatus,
  updateProjectMilestonePlanning,
  upsertProjectTechnicalProfile,
} from "@/actions/projets"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type Milestone = { id: string; updatedAt: string; title: string; description?: string | null; kind: string; status: string; plannedStartAt?: string | null; dueDate?: string | null; durationDays: number; dependsOnId?: string | null; dependsOn?: { id: string; title: string; status: string } | null; assignedMembershipId?: string | null; assignedMembership?: { user: { name?: string | null; email?: string | null } } | null; dependencyUnavailable?: boolean; assigneeUnavailable?: boolean; templateUnavailable?: boolean }
type Acceptance = { id: string; updatedAt: string; title: string; status: string; dueDate?: string | null }
type ProjectFile = { id: string; name: string; size: number; type: string; createdAt: string }
type PlanningMember = { id: string; user: { name?: string | null; email?: string | null } }
type Profile = {
  updatedAt: string
  surveyStatus?: "DRAFT" | "SURVEYED" | "VALIDATED" | null
  surveyedAt?: string | null; surveyedBy?: string | null; poolShape?: string | null
  poolLengthMm?: number | null; poolWidthMm?: number | null; poolDepthMm?: number | null
  diagonal1Mm?: number | null; diagonal2Mm?: number | null; accessWidthMm?: number | null
  copingType?: string | null; deckMaterial?: string | null; powerSupply?: string | null
  obstacles?: string | null; installationConstraints?: string | null
  recommendedProduct?: string | null; coverModel?: string | null; coverColor?: string | null
  measurementNotes?: string | null; validationNotes?: string | null; validatedAt?: string | null
} | null

const emptyProfile = {
  surveyStatus: "DRAFT" as const, surveyedAt: "", surveyedBy: "", poolShape: "",
  poolLengthMm: "", poolWidthMm: "", poolDepthMm: "", diagonal1Mm: "", diagonal2Mm: "",
  copingType: "", deckMaterial: "", accessWidthMm: "", powerSupply: "", obstacles: "",
  installationConstraints: "", recommendedProduct: "", coverModel: "", coverColor: "",
  measurementNotes: "", validationNotes: "",
}

function profileDraft(profile: Profile) {
  return { ...emptyProfile, ...profile, surveyStatus: profile?.surveyStatus ?? "DRAFT", surveyedAt: profile?.surveyedAt?.slice(0, 10) ?? "" }
}

export function ProjectWorkspace({ projectId, milestones, acceptanceItems, files, profile, members, canWrite }: {
  projectId: string
  canWrite: boolean
  milestones: Milestone[]
  acceptanceItems: Acceptance[]
  files: ProjectFile[]
  profile: Profile
  members: PlanningMember[]
}) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)
  const writeDisabled = pending || !canWrite || isReadOnlyDemo
  const [milestoneOpen, setMilestoneOpen] = React.useState(false)
  const [planningTarget, setPlanningTarget] = React.useState<Milestone | null>(null)
  const [profileOpen, setProfileOpen] = React.useState(false)
  const [milestone, setMilestone] = React.useState({ title: "", description: "", kind: "MILESTONE", plannedStartAt: "", dueDate: "", durationDays: "1", dependsOnId: "", assignedMembershipId: "" })
  const [acceptanceTitle, setAcceptanceTitle] = React.useState("")
  const [technical, setTechnical] = React.useState(() => profileDraft(profile))
  const [profileRevision, setProfileRevision] = React.useState(profile?.updatedAt ?? null)
  const savedTechnical = profile ?? emptyProfile

  function openTechnicalProfile() {
    setTechnical(profileDraft(profile))
    setProfileRevision(profile?.updatedAt ?? null)
    setProfileOpen(true)
  }

  async function run(operation: () => Promise<unknown>, success: string) {
    setPending(true)
    try {
      const result = await operation()
      if (result && typeof result === "object" && "success" in result && result.success === false) throw new Error("error" in result && typeof result.error === "string" ? result.error : "Action refusée.")
      toast.success(success); router.refresh(); return true
    }
    catch (error) { toast.error(error instanceof Error ? error.message : "Action impossible."); return false }
    finally { setPending(false) }
  }

  async function submitMilestone(event: React.FormEvent) {
    event.preventDefault()
    if (!await run(() => createProjectMilestone(projectId, milestone), "Jalon ajouté.")) return
    setMilestone({ title: "", description: "", kind: "MILESTONE", plannedStartAt: "", dueDate: "", durationDays: "1", dependsOnId: "", assignedMembershipId: "" })
    setMilestoneOpen(false)
  }

  async function savePlanning(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!planningTarget) return
    const form = new FormData(event.currentTarget)
    if (!await run(() => updateProjectMilestonePlanning(planningTarget.id, { plannedStartAt: form.get("plannedStartAt"), dueDate: form.get("dueDate"), durationDays: form.get("durationDays"), dependsOnId: form.get("dependsOnId"), assignedMembershipId: form.get("assignedMembershipId") }, planningTarget.updatedAt), "Planification mise à jour.")) return
    setPlanningTarget(null)
  }

  async function addAcceptance(event: React.FormEvent) {
    event.preventDefault()
    if (!acceptanceTitle.trim()) return
    if (await run(() => createProjectAcceptanceItem(projectId, { title: acceptanceTitle }), "Élément de recette ajouté.")) setAcceptanceTitle("")
  }

  async function saveTechnical(event: React.FormEvent) {
    event.preventDefault()
    if (!await run(() => upsertProjectTechnicalProfile(projectId, technical, profileRevision), "Relevé technique enregistré.")) return
    setProfileOpen(false)
  }

  async function uploadFile(file: File | undefined) {
    if (!file) return
    setPending(true)
    try {
      await uploadResourceFile("project", projectId, file)
      toast.success("Document projet enregistré."); router.refresh()
    } catch (error) { toast.error(error instanceof Error ? error.message : "Import impossible.") }
    finally { setPending(false) }
  }

  async function deleteFile(id: string) {
    setPending(true)
    try {
      const response = await fetch(`/api/files/project/${id}`, { method: "DELETE" })
      if (!response.ok) throw new Error("Suppression impossible")
      toast.success("Document supprimé."); router.refresh()
    } catch (error) { toast.error(error instanceof Error ? error.message : "Suppression impossible.") }
    finally { setPending(false) }
  }

  return <>
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader className="flex-row items-center justify-between"><CardTitle className="text-sm">Jalons</CardTitle><Button demoMutation size="sm" variant="outline" className="gap-2" disabled={writeDisabled} onClick={() => setMilestoneOpen(true)}><Plus /> Ajouter</Button></CardHeader>
        <CardContent className="space-y-2">
          {milestones.length === 0 ? <p className="text-sm text-muted-foreground">Aucun jalon.</p> : milestones.map((item) => (
            <div key={item.id} className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{item.title}</span><Badge variant="outline">{item.kind === "TASK" ? "Tâche" : item.kind === "CHECKPOINT" ? "Contrôle" : "Jalon"}</Badge></div><div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground"><span>{item.plannedStartAt ? `${new Date(item.plannedStartAt).toLocaleDateString("fr-FR", { timeZone: "UTC" })} → ` : ""}{item.dueDate ? new Date(item.dueDate).toLocaleDateString("fr-FR", { timeZone: "UTC" }) : "Sans échéance"}</span>{item.dependsOn ? <span className="inline-flex items-center gap-1"><Link2 className="size-3" />après {item.dependsOn.title}</span> : item.dependencyUnavailable ? <span>Dépendance indisponible</span> : null}{item.assignedMembership ? <span className="inline-flex items-center gap-1"><UserRound className="size-3" />{item.assignedMembership.user.name || item.assignedMembership.user.email}</span> : item.assigneeUnavailable ? <span>Responsable indisponible</span> : null}{item.templateUnavailable ? <span>Étape de modèle indisponible</span> : null}</div></div>
              <Select disabled={writeDisabled || item.dependencyUnavailable || item.assigneeUnavailable || item.templateUnavailable} value={item.status} onValueChange={(value) => run(() => updateProjectMilestoneStatus(item.id, (value ?? "PENDING") as "PENDING" | "IN_PROGRESS" | "DONE", item.updatedAt), "Jalon mis à jour.")}><SelectTrigger aria-label={`Statut de ${item.title}`} className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="PENDING">À faire</SelectItem><SelectItem value="IN_PROGRESS">En cours</SelectItem><SelectItem value="DONE">Terminé</SelectItem></SelectContent></Select>
              <Button size="icon-xs" variant="ghost" title="Planifier" disabled={writeDisabled || item.dependencyUnavailable || item.assigneeUnavailable || item.templateUnavailable} onClick={() => setPlanningTarget(item)}><CalendarRange /></Button>
              <Button size="icon-xs" variant="ghost" title="Supprimer" disabled={writeDisabled || item.dependencyUnavailable || item.assigneeUnavailable || item.templateUnavailable} onClick={() => run(() => deleteProjectMilestone(item.id, item.updatedAt), "Jalon supprimé.")}><Trash2 className="text-danger" /></Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Contrôle de fin de chantier</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <form className="flex gap-2" onSubmit={addAcceptance}><Input disabled={writeDisabled} aria-label="Nouveau point de contrôle" value={acceptanceTitle} onChange={(event) => setAcceptanceTitle(event.target.value)} placeholder="Ex. essais, réglages, nettoyage" /><Button type="submit" disabled={writeDisabled} size="icon" title="Ajouter"><Plus /></Button></form>
          {acceptanceItems.length === 0 ? <p className="text-sm text-muted-foreground">Aucun critère.</p> : acceptanceItems.map((item) => (
            <div key={item.id} className="flex items-center gap-3 rounded-lg border p-3 text-sm"><Checkbox disabled={writeDisabled} checked={item.status === "DONE"} onCheckedChange={(checked) => run(() => updateProjectAcceptanceStatus(item.id, checked ? "DONE" : "TODO", item.updatedAt), "Recette mise à jour.")} /><span className={item.status === "DONE" ? "flex-1 line-through text-muted-foreground" : "flex-1"}>{item.title}</span><Button size="icon-xs" variant="ghost" title="Supprimer" disabled={writeDisabled} onClick={() => run(() => deleteProjectAcceptanceItem(item.id, item.updatedAt), "Élément supprimé.")}><Trash2 className="text-danger" /></Button></div>
          ))}
        </CardContent>
      </Card>
    </div>

    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader className="flex-row items-center justify-between"><CardTitle className="flex items-center gap-2 text-sm"><Ruler className="size-4 text-primary" />Relevé technique bassin & pose</CardTitle><Button demoMutation size="sm" variant="outline" className="gap-2" disabled={writeDisabled} onClick={openTechnicalProfile}><Settings2 /> Modifier</Button></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2"><Badge variant={savedTechnical.surveyStatus === "VALIDATED" ? "secondary" : "outline"}>{savedTechnical.surveyStatus === "VALIDATED" ? "Validé" : savedTechnical.surveyStatus === "SURVEYED" ? "Relevé effectué" : "Brouillon"}</Badge>{savedTechnical.surveyedAt ? <span className="text-xs text-muted-foreground">Relevé le {new Date(savedTechnical.surveyedAt).toLocaleDateString("fr-FR", { timeZone: "UTC" })}{savedTechnical.surveyedBy ? ` par ${savedTechnical.surveyedBy}` : ""}</span> : null}</div>
          {savedTechnical.poolShape || savedTechnical.poolLengthMm || savedTechnical.poolWidthMm ? <div className="grid grid-cols-2 gap-3 rounded-lg border p-3 sm:grid-cols-4"><div><p className="text-xs text-muted-foreground">Forme</p><p className="font-medium">{savedTechnical.poolShape || "—"}</p></div><div><p className="text-xs text-muted-foreground">Longueur</p><p className="font-medium tabular-nums">{savedTechnical.poolLengthMm ? `${savedTechnical.poolLengthMm} mm` : "—"}</p></div><div><p className="text-xs text-muted-foreground">Largeur</p><p className="font-medium tabular-nums">{savedTechnical.poolWidthMm ? `${savedTechnical.poolWidthMm} mm` : "—"}</p></div><div><p className="text-xs text-muted-foreground">Profondeur</p><p className="font-medium tabular-nums">{savedTechnical.poolDepthMm ? `${savedTechnical.poolDepthMm} mm` : "—"}</p></div></div> : null}
          {savedTechnical.coverModel || savedTechnical.recommendedProduct ? <p><strong>Solution préconisée :</strong> {[savedTechnical.recommendedProduct, savedTechnical.coverModel, savedTechnical.coverColor].filter(Boolean).join(" · ")}</p> : null}
          {savedTechnical.surveyStatus === "VALIDATED" ? <p className="flex items-center gap-2 text-xs font-medium text-emerald-700"><ShieldCheck className="size-4" />Relevé validé pour préparation et pose.</p> : null}
          {!savedTechnical.surveyedAt && !savedTechnical.poolShape && !savedTechnical.poolLengthMm ? <p className="text-muted-foreground">Aucun relevé renseigné.</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between"><CardTitle className="text-sm">Fichiers projet</CardTitle><Label className="cursor-pointer"><input type="file" className="hidden" disabled={writeDisabled} onChange={(event) => uploadFile(event.target.files?.[0])} /><span className="inline-flex h-8 items-center gap-2 rounded-lg border px-3 text-sm font-medium hover:bg-muted"><Upload /> Ajouter</span></Label></CardHeader>
        <CardContent className="space-y-2">{files.length === 0 ? <p className="text-sm text-muted-foreground">Aucun fichier.</p> : files.map((file) => <div key={file.id} className="flex items-center gap-2 rounded-lg border p-3"><FileText className="text-muted-foreground" /><a className="min-w-0 flex-1 truncate text-sm font-medium hover:underline" href={`/api/files/project/${file.id}`} target="_blank" rel="noreferrer">{file.name}</a><Button size="icon-xs" variant="ghost" title="Supprimer" disabled={writeDisabled} onClick={() => deleteFile(file.id)}><Trash2 className="text-danger" /></Button></div>)}</CardContent>
      </Card>
    </div>

    <Dialog open={milestoneOpen} onOpenChange={setMilestoneOpen}><DialogContent><form onSubmit={submitMilestone} className="space-y-4"><DialogHeader><DialogTitle>Nouveau jalon</DialogTitle></DialogHeader><div><Label>Titre</Label><Input disabled={writeDisabled} value={milestone.title} onChange={(event) => setMilestone({ ...milestone, title: event.target.value })} required /></div><div><Label>Description</Label><Input disabled={writeDisabled} value={milestone.description} onChange={(event) => setMilestone({ ...milestone, description: event.target.value })} /></div><div className="grid grid-cols-2 gap-3"><label className="space-y-1.5 text-sm font-medium">Type<select disabled={writeDisabled} aria-label="Type du jalon" value={milestone.kind} onChange={(event) => setMilestone({ ...milestone, kind: event.target.value })} className="mt-1 h-10 w-full rounded-[10px] border bg-background px-3 text-sm"><option value="MILESTONE">Jalon</option><option value="TASK">Tâche</option><option value="CHECKPOINT">Contrôle</option></select></label><div><Label htmlFor="milestoneDuration">Durée (jours)</Label><Input disabled={writeDisabled} id="milestoneDuration" type="number" min="0" value={milestone.durationDays} onChange={(event) => setMilestone({ ...milestone, durationDays: event.target.value })} /></div></div><div className="grid grid-cols-2 gap-3"><div><Label htmlFor="milestoneStart">Début prévu</Label><Input disabled={writeDisabled} id="milestoneStart" type="date" value={milestone.plannedStartAt} onChange={(event) => setMilestone({ ...milestone, plannedStartAt: event.target.value })} /></div><div><Label htmlFor="milestoneDue">Échéance</Label><Input disabled={writeDisabled} id="milestoneDue" type="date" value={milestone.dueDate} onChange={(event) => setMilestone({ ...milestone, dueDate: event.target.value })} /></div></div><label className="space-y-1.5 text-sm font-medium">Prérequis<select disabled={writeDisabled} aria-label="Prérequis du jalon" value={milestone.dependsOnId} onChange={(event) => setMilestone({ ...milestone, dependsOnId: event.target.value })} className="mt-1 h-10 w-full rounded-[10px] border bg-background px-3 text-sm"><option value="">Aucun</option>{milestones.map((item) => <option key={item.id} value={item.id} disabled={item.dependencyUnavailable || item.assigneeUnavailable || item.templateUnavailable}>{item.title}</option>)}</select></label><label className="space-y-1.5 text-sm font-medium">Responsable<select disabled={writeDisabled} aria-label="Responsable du jalon" value={milestone.assignedMembershipId} onChange={(event) => setMilestone({ ...milestone, assignedMembershipId: event.target.value })} className="mt-1 h-10 w-full rounded-[10px] border bg-background px-3 text-sm"><option value="">Non affecté</option>{members.map((member) => <option key={member.id} value={member.id}>{member.user.name || member.user.email}</option>)}</select></label><DialogFooter><Button type="button" variant="outline" onClick={() => setMilestoneOpen(false)}>Annuler</Button><Button demoMutation type="submit" disabled={writeDisabled}>Ajouter</Button></DialogFooter></form></DialogContent></Dialog>

    <Dialog open={Boolean(planningTarget)} onOpenChange={(open) => { if (!open) setPlanningTarget(null) }}><DialogContent><form key={planningTarget?.id} onSubmit={savePlanning} className="space-y-4"><DialogHeader><DialogTitle>Planifier {planningTarget?.title}</DialogTitle></DialogHeader><div className="grid grid-cols-2 gap-3"><div><Label htmlFor="planningStart">Début prévu</Label><Input disabled={writeDisabled} id="planningStart" name="plannedStartAt" type="date" defaultValue={planningTarget?.plannedStartAt?.slice(0, 10) || ""} /></div><div><Label htmlFor="planningDue">Échéance</Label><Input disabled={writeDisabled} id="planningDue" name="dueDate" type="date" defaultValue={planningTarget?.dueDate?.slice(0, 10) || ""} /></div></div><div><Label htmlFor="planningDuration">Durée (jours)</Label><Input disabled={writeDisabled} id="planningDuration" name="durationDays" type="number" min="0" defaultValue={planningTarget?.durationDays ?? 1} /></div><label className="space-y-1.5 text-sm font-medium">Prérequis<select disabled={writeDisabled} name="dependsOnId" aria-label="Prérequis planifié" defaultValue={planningTarget?.dependsOnId || ""} className="mt-1 h-10 w-full rounded-[10px] border bg-background px-3 text-sm"><option value="">Aucun</option>{milestones.filter((item) => item.id !== planningTarget?.id).map((item) => <option key={item.id} value={item.id} disabled={item.dependencyUnavailable || item.assigneeUnavailable || item.templateUnavailable}>{item.title}</option>)}</select></label><label className="space-y-1.5 text-sm font-medium">Responsable<select disabled={writeDisabled} name="assignedMembershipId" aria-label="Responsable planifié" defaultValue={planningTarget?.assignedMembershipId || ""} className="mt-1 h-10 w-full rounded-[10px] border bg-background px-3 text-sm"><option value="">Non affecté</option>{members.map((member) => <option key={member.id} value={member.id}>{member.user.name || member.user.email}</option>)}</select></label><DialogFooter><Button type="button" variant="outline" onClick={() => setPlanningTarget(null)}>Annuler</Button><Button demoMutation type="submit" disabled={writeDisabled}>Enregistrer</Button></DialogFooter></form></DialogContent></Dialog>

    <Dialog open={profileOpen} onOpenChange={setProfileOpen}><DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto"><form onSubmit={saveTechnical} className="space-y-5"><DialogHeader><DialogTitle>Relevé technique bassin & pose</DialogTitle></DialogHeader>
      <div className="grid gap-3 sm:grid-cols-3"><div><Label htmlFor="surveyStatus">État du relevé</Label><select disabled={writeDisabled} id="surveyStatus" className="h-10 w-full rounded-lg border bg-background px-3 text-sm" value={technical.surveyStatus} onChange={(event) => setTechnical({ ...technical, surveyStatus: event.target.value as "DRAFT" | "SURVEYED" | "VALIDATED" })}><option value="DRAFT">Brouillon</option><option value="SURVEYED">Relevé effectué</option><option value="VALIDATED">Validé pour pose</option></select></div><div><Label htmlFor="surveyedAt">Date du relevé</Label><Input disabled={writeDisabled} id="surveyedAt" type="date" value={technical.surveyedAt ?? ""} onChange={(event) => setTechnical({ ...technical, surveyedAt: event.target.value })} /></div><div><Label htmlFor="surveyedBy">Technicien</Label><Input disabled={writeDisabled} id="surveyedBy" value={technical.surveyedBy ?? ""} onChange={(event) => setTechnical({ ...technical, surveyedBy: event.target.value })} /></div></div>
      <fieldset className="space-y-3 rounded-xl border p-4"><legend className="px-1 text-sm font-semibold">Dimensions du bassin (mm)</legend><div className="grid gap-3 sm:grid-cols-3"><div><Label htmlFor="poolShape">Forme</Label><Input disabled={writeDisabled} id="poolShape" value={technical.poolShape ?? ""} placeholder="Rectangle, ovale, libre…" onChange={(event) => setTechnical({ ...technical, poolShape: event.target.value })} /></div>{([['poolLengthMm','Longueur'],['poolWidthMm','Largeur'],['poolDepthMm','Profondeur'],['diagonal1Mm','Diagonale 1'],['diagonal2Mm','Diagonale 2']] as const).map(([key, label]) => <div key={key}><Label htmlFor={key}>{label}</Label><Input disabled={writeDisabled} id={key} type="number" min="0" step="1" value={technical[key] ?? ""} onChange={(event) => setTechnical({ ...technical, [key]: event.target.value })} /></div>)}</div></fieldset>
      <fieldset className="space-y-3 rounded-xl border p-4"><legend className="px-1 text-sm font-semibold">Environnement de pose</legend><div className="grid gap-3 sm:grid-cols-2">{([['copingType','Margelles'],['deckMaterial','Revêtement de plage'],['accessWidthMm','Largeur d’accès (mm)'],['powerSupply','Alimentation électrique']] as const).map(([key, label]) => <div key={key}><Label htmlFor={key}>{label}</Label><Input disabled={writeDisabled} id={key} type={key === 'accessWidthMm' ? 'number' : 'text'} min={key === 'accessWidthMm' ? '0' : undefined} value={technical[key] ?? ""} onChange={(event) => setTechnical({ ...technical, [key]: event.target.value })} /></div>)}</div><div className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor="obstacles">Obstacles</Label><textarea disabled={writeDisabled} id="obstacles" className="min-h-24 w-full rounded-lg border bg-background p-2.5 text-sm" value={technical.obstacles ?? ""} onChange={(event) => setTechnical({ ...technical, obstacles: event.target.value })} /></div><div><Label htmlFor="installationConstraints">Contraintes d’installation</Label><textarea disabled={writeDisabled} id="installationConstraints" className="min-h-24 w-full rounded-lg border bg-background p-2.5 text-sm" value={technical.installationConstraints ?? ""} onChange={(event) => setTechnical({ ...technical, installationConstraints: event.target.value })} /></div></div></fieldset>
      <fieldset className="space-y-3 rounded-xl border p-4"><legend className="px-1 text-sm font-semibold">Solution préconisée</legend><div className="grid gap-3 sm:grid-cols-3">{([['recommendedProduct','Famille / produit'],['coverModel','Modèle de couverture'],['coverColor','Coloris']] as const).map(([key, label]) => <div key={key}><Label htmlFor={key}>{label}</Label><Input disabled={writeDisabled} id={key} value={technical[key] ?? ""} onChange={(event) => setTechnical({ ...technical, [key]: event.target.value })} /></div>)}</div><div><Label htmlFor="measurementNotes">Notes de mesure</Label><textarea disabled={writeDisabled} id="measurementNotes" className="min-h-24 w-full rounded-lg border bg-background p-2.5 text-sm" value={technical.measurementNotes ?? ""} onChange={(event) => setTechnical({ ...technical, measurementNotes: event.target.value })} /></div><div><Label htmlFor="validationNotes">Notes de validation</Label><textarea disabled={writeDisabled} id="validationNotes" className="min-h-20 w-full rounded-lg border bg-background p-2.5 text-sm" value={technical.validationNotes ?? ""} onChange={(event) => setTechnical({ ...technical, validationNotes: event.target.value })} /></div></fieldset>
      <DialogFooter><Button type="button" variant="outline" onClick={() => setProfileOpen(false)}>Annuler</Button><Button demoMutation type="submit" disabled={writeDisabled}>Enregistrer le relevé</Button></DialogFooter></form></DialogContent></Dialog>
  </>
}
