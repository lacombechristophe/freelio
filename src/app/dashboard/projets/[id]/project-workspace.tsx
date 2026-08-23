"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { ExternalLink, FileText, GitBranch, Globe, Plus, Settings2, Trash2, Upload } from "lucide-react"
import { toast } from "sonner"
import {
  createProjectAcceptanceItem,
  createProjectMilestone,
  deleteProjectAcceptanceItem,
  deleteProjectMilestone,
  updateProjectAcceptanceStatus,
  updateProjectMilestoneStatus,
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

type Milestone = { id: string; title: string; description?: string | null; status: string; dueDate?: string | null }
type Acceptance = { id: string; title: string; status: string; dueDate?: string | null }
type ProjectFile = { id: string; name: string; size: number; type: string; createdAt: string }
type Profile = {
  repositoryUrl?: string | null; productionUrl?: string | null; stagingUrl?: string | null;
  documentationUrl?: string | null; hostingProvider?: string | null; stack?: string | null;
  domainName?: string | null; domainExpiresAt?: string | null; notes?: string | null
} | null

const emptyProfile = {
  repositoryUrl: "", productionUrl: "", stagingUrl: "", documentationUrl: "",
  hostingProvider: "", stack: "", domainName: "", domainExpiresAt: "", notes: "",
}

export function ProjectWorkspace({ projectId, milestones, acceptanceItems, files, profile }: {
  projectId: string
  milestones: Milestone[]
  acceptanceItems: Acceptance[]
  files: ProjectFile[]
  profile: Profile
}) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)
  const [milestoneOpen, setMilestoneOpen] = React.useState(false)
  const [profileOpen, setProfileOpen] = React.useState(false)
  const [milestone, setMilestone] = React.useState({ title: "", description: "", dueDate: "" })
  const [acceptanceTitle, setAcceptanceTitle] = React.useState("")
  const [technical, setTechnical] = React.useState({
    ...emptyProfile,
    ...profile,
    domainExpiresAt: profile?.domainExpiresAt?.slice(0, 10) ?? "",
  })

  async function run(operation: () => Promise<unknown>, success: string) {
    setPending(true)
    try { await operation(); toast.success(success); router.refresh() }
    catch (error) { toast.error(error instanceof Error ? error.message : "Action impossible.") }
    finally { setPending(false) }
  }

  async function submitMilestone(event: React.FormEvent) {
    event.preventDefault()
    await run(() => createProjectMilestone(projectId, milestone), "Jalon ajouté.")
    setMilestone({ title: "", description: "", dueDate: "" })
    setMilestoneOpen(false)
  }

  async function addAcceptance(event: React.FormEvent) {
    event.preventDefault()
    if (!acceptanceTitle.trim()) return
    await run(() => createProjectAcceptanceItem(projectId, { title: acceptanceTitle }), "Élément de recette ajouté.")
    setAcceptanceTitle("")
  }

  async function saveTechnical(event: React.FormEvent) {
    event.preventDefault()
    await run(() => upsertProjectTechnicalProfile(projectId, technical), "Registre technique enregistré.")
    setProfileOpen(false)
  }

  async function uploadFile(file: File | undefined) {
    if (!file) return
    setPending(true)
    try {
      const formData = new FormData(); formData.set("file", file)
      const response = await fetch(`/api/files/project/${projectId}`, { method: "POST", body: formData })
      const result = await response.json()
      if (!response.ok) throw new Error(result?.error ?? "Import impossible")
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
        <CardHeader className="flex-row items-center justify-between"><CardTitle className="text-sm">Jalons</CardTitle><Button size="sm" variant="outline" className="gap-2" onClick={() => setMilestoneOpen(true)}><Plus /> Ajouter</Button></CardHeader>
        <CardContent className="space-y-2">
          {milestones.length === 0 ? <p className="text-sm text-muted-foreground">Aucun jalon.</p> : milestones.map((item) => (
            <div key={item.id} className="flex items-center gap-3 rounded-lg border p-3">
              <div className="min-w-0 flex-1"><div className="font-medium">{item.title}</div><div className="text-xs text-muted-foreground">{item.dueDate ? new Date(item.dueDate).toLocaleDateString("fr-FR") : "Sans échéance"}</div></div>
              <Select value={item.status} onValueChange={(value) => run(() => updateProjectMilestoneStatus(item.id, (value ?? "PENDING") as "PENDING" | "IN_PROGRESS" | "DONE"), "Jalon mis à jour.")}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="PENDING">À faire</SelectItem><SelectItem value="IN_PROGRESS">En cours</SelectItem><SelectItem value="DONE">Terminé</SelectItem></SelectContent></Select>
              <Button size="icon-xs" variant="ghost" title="Supprimer" onClick={() => run(() => deleteProjectMilestone(item.id), "Jalon supprimé.")}><Trash2 className="text-danger" /></Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Recette et livraison</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <form className="flex gap-2" onSubmit={addAcceptance}><Input aria-label="Nouveau critère d’acceptation" value={acceptanceTitle} onChange={(event) => setAcceptanceTitle(event.target.value)} placeholder="Critère d'acceptation" /><Button type="submit" size="icon" title="Ajouter"><Plus /></Button></form>
          {acceptanceItems.length === 0 ? <p className="text-sm text-muted-foreground">Aucun critère.</p> : acceptanceItems.map((item) => (
            <div key={item.id} className="flex items-center gap-3 rounded-lg border p-3 text-sm"><Checkbox checked={item.status === "DONE"} onCheckedChange={(checked) => run(() => updateProjectAcceptanceStatus(item.id, checked ? "DONE" : "TODO"), "Recette mise à jour.")} /><span className={item.status === "DONE" ? "flex-1 line-through text-muted-foreground" : "flex-1"}>{item.title}</span><Button size="icon-xs" variant="ghost" title="Supprimer" onClick={() => run(() => deleteProjectAcceptanceItem(item.id), "Élément supprimé.")}><Trash2 className="text-danger" /></Button></div>
          ))}
        </CardContent>
      </Card>
    </div>

    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader className="flex-row items-center justify-between"><CardTitle className="text-sm">Registre technique</CardTitle><Button size="sm" variant="outline" className="gap-2" onClick={() => setProfileOpen(true)}><Settings2 /> Modifier</Button></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-2">{technical.stack && technical.stack.split(",").map((item) => <Badge key={item} variant="secondary">{item.trim()}</Badge>)}</div>
          {technical.repositoryUrl && <a className="flex items-center gap-2 hover:underline" href={technical.repositoryUrl} target="_blank" rel="noreferrer"><GitBranch /> Dépôt source <ExternalLink className="size-3" /></a>}
          {technical.productionUrl && <a className="flex items-center gap-2 hover:underline" href={technical.productionUrl} target="_blank" rel="noreferrer"><Globe /> Production <ExternalLink className="size-3" /></a>}
          {technical.stagingUrl && <a className="flex items-center gap-2 hover:underline" href={technical.stagingUrl} target="_blank" rel="noreferrer"><Globe /> Staging <ExternalLink className="size-3" /></a>}
          {technical.domainName && <div>Domaine : <strong>{technical.domainName}</strong>{technical.domainExpiresAt ? ` · renouvellement ${new Date(technical.domainExpiresAt).toLocaleDateString("fr-FR")}` : ""}</div>}
          {!technical.repositoryUrl && !technical.productionUrl && !technical.stack && <p className="text-muted-foreground">Registre non renseigné.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between"><CardTitle className="text-sm">Fichiers projet</CardTitle><Label className="cursor-pointer"><input type="file" className="hidden" disabled={pending} onChange={(event) => uploadFile(event.target.files?.[0])} /><span className="inline-flex h-8 items-center gap-2 rounded-lg border px-3 text-sm font-medium hover:bg-muted"><Upload /> Ajouter</span></Label></CardHeader>
        <CardContent className="space-y-2">{files.length === 0 ? <p className="text-sm text-muted-foreground">Aucun fichier.</p> : files.map((file) => <div key={file.id} className="flex items-center gap-2 rounded-lg border p-3"><FileText className="text-muted-foreground" /><a className="min-w-0 flex-1 truncate text-sm font-medium hover:underline" href={`/api/files/project/${file.id}`} target="_blank" rel="noreferrer">{file.name}</a><Button size="icon-xs" variant="ghost" title="Supprimer" onClick={() => deleteFile(file.id)}><Trash2 className="text-danger" /></Button></div>)}</CardContent>
      </Card>
    </div>

    <Dialog open={milestoneOpen} onOpenChange={setMilestoneOpen}><DialogContent><form onSubmit={submitMilestone} className="space-y-4"><DialogHeader><DialogTitle>Nouveau jalon</DialogTitle></DialogHeader><div><Label>Titre</Label><Input value={milestone.title} onChange={(event) => setMilestone({ ...milestone, title: event.target.value })} required /></div><div><Label>Description</Label><Input value={milestone.description} onChange={(event) => setMilestone({ ...milestone, description: event.target.value })} /></div><div><Label>Échéance</Label><Input type="date" value={milestone.dueDate} onChange={(event) => setMilestone({ ...milestone, dueDate: event.target.value })} /></div><DialogFooter><Button type="button" variant="outline" onClick={() => setMilestoneOpen(false)}>Annuler</Button><Button type="submit" disabled={pending}>Ajouter</Button></DialogFooter></form></DialogContent></Dialog>

    <Dialog open={profileOpen} onOpenChange={setProfileOpen}><DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto"><form onSubmit={saveTechnical} className="space-y-4"><DialogHeader><DialogTitle>Registre technique</DialogTitle></DialogHeader><div className="grid gap-3 sm:grid-cols-2">{([['repositoryUrl','Dépôt Git'],['productionUrl','URL production'],['stagingUrl','URL staging'],['documentationUrl','Documentation'],['hostingProvider','Hébergeur'],['stack','Stack (séparée par virgules)'],['domainName','Domaine'],['domainExpiresAt','Renouvellement domaine']] as const).map(([key, label]) => <div key={key}><Label>{label}</Label><Input type={key === 'domainExpiresAt' ? 'date' : 'text'} value={technical[key] ?? ''} onChange={(event) => setTechnical({ ...technical, [key]: event.target.value })} /></div>)}</div><div><Label>Notes de reprise</Label><textarea className="min-h-28 w-full rounded-lg border bg-background p-2.5 text-sm" value={technical.notes ?? ''} onChange={(event) => setTechnical({ ...technical, notes: event.target.value })} /></div><DialogFooter><Button type="button" variant="outline" onClick={() => setProfileOpen(false)}>Annuler</Button><Button type="submit" disabled={pending}>Enregistrer</Button></DialogFooter></form></DialogContent></Dialog>
  </>
}
