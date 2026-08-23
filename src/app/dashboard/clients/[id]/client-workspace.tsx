"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { CalendarClock, FileText, Mail, MessageSquarePlus, Phone, Plus, Trash2, Upload } from "lucide-react"
import { toast } from "sonner"
import {
  addClientActivity,
  createContact,
  deleteClientActivity,
  deleteContact,
  setClientNextAction,
} from "@/actions/clients"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type Contact = {
  id: string; firstName: string; lastName: string; email?: string | null;
  phone?: string | null; role?: string | null; isPrimary: boolean
}
type Activity = { id: string; type: string; content: string; happenedAt: string }
type ClientFile = { id: string; name: string; size: number; type: string; createdAt: string }

export function ClientWorkspace({
  clientId,
  nextActionLabel,
  nextActionAt,
  contacts,
  activities,
  files,
}: {
  clientId: string
  nextActionLabel?: string | null
  nextActionAt?: string | null
  contacts: Contact[]
  activities: Activity[]
  files: ClientFile[]
}) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)
  const [contactOpen, setContactOpen] = React.useState(false)
  const [activityOpen, setActivityOpen] = React.useState(false)
  const [actionLabel, setActionLabel] = React.useState(nextActionLabel ?? "")
  const [actionDate, setActionDate] = React.useState(nextActionAt?.slice(0, 10) ?? "")
  const [contact, setContact] = React.useState({ firstName: "", lastName: "", email: "", phone: "", role: "", isPrimary: false })
  const [activity, setActivity] = React.useState({ type: "NOTE", content: "", happenedAt: new Date().toISOString().slice(0, 16) })

  async function run(operation: () => Promise<unknown>, success: string) {
    setPending(true)
    try {
      await operation()
      toast.success(success)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action impossible.")
    } finally {
      setPending(false)
    }
  }

  async function saveNextAction() {
    await run(() => setClientNextAction(clientId, { label: actionLabel, date: actionDate }), "Prochaine action mise à jour.")
  }

  async function submitContact(event: React.FormEvent) {
    event.preventDefault()
    await run(() => createContact(clientId, contact), "Contact ajouté.")
    setContactOpen(false)
    setContact({ firstName: "", lastName: "", email: "", phone: "", role: "", isPrimary: false })
  }

  async function submitActivity(event: React.FormEvent) {
    event.preventDefault()
    await run(() => addClientActivity(clientId, activity), "Activité ajoutée.")
    setActivityOpen(false)
    setActivity({ type: "NOTE", content: "", happenedAt: new Date().toISOString().slice(0, 16) })
  }

  async function uploadFile(file: File | undefined) {
    if (!file) return
    setPending(true)
    try {
      const formData = new FormData()
      formData.set("file", file)
      const response = await fetch(`/api/files/client/${clientId}`, { method: "POST", body: formData })
      const result = await response.json()
      if (!response.ok) throw new Error(result?.error ?? "Import impossible")
      toast.success("Document client enregistré.")
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import impossible.")
    } finally {
      setPending(false)
    }
  }

  async function deleteFile(id: string) {
    setPending(true)
    try {
      const response = await fetch(`/api/files/client/${id}`, { method: "DELETE" })
      if (!response.ok) throw new Error("Suppression impossible")
      toast.success("Document supprimé.")
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Suppression impossible.")
    } finally {
      setPending(false)
    }
  }

  return <>
    <Card className={nextActionAt && new Date(nextActionAt) < new Date() ? "border-warning/40" : ""}>
      <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><CalendarClock /> Prochaine action</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row">
        <Input aria-label="Prochaine action" value={actionLabel} onChange={(event) => setActionLabel(event.target.value)} placeholder="Relancer, appeler, envoyer le devis…" className="flex-1" />
        <Input aria-label="Date de la prochaine action" type="date" value={actionDate} onChange={(event) => setActionDate(event.target.value)} className="sm:w-44" />
        <Button onClick={saveNextAction} disabled={pending}>Enregistrer</Button>
      </CardContent>
    </Card>

    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader className="flex-row items-center justify-between"><CardTitle className="text-sm">Contacts</CardTitle><Button size="sm" variant="outline" className="gap-2" onClick={() => setContactOpen(true)}><Plus /> Ajouter</Button></CardHeader>
        <CardContent className="space-y-2">
          {contacts.length === 0 ? <p className="text-sm text-muted-foreground">Aucun contact.</p> : contacts.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
              <div><div className="font-medium">{item.firstName} {item.lastName} {item.isPrimary && <Badge className="ml-1">Principal</Badge>}</div><div className="text-xs text-muted-foreground">{item.role}</div></div>
              <div className="flex items-center gap-1">
                {item.email && <a href={`mailto:${item.email}`}><Button size="icon" variant="ghost" title={item.email}><Mail /></Button></a>}
                {item.phone && <a href={`tel:${item.phone}`}><Button size="icon" variant="ghost" title={item.phone}><Phone /></Button></a>}
                <Button size="icon" variant="ghost" title="Supprimer" disabled={pending} onClick={() => run(() => deleteContact(item.id), "Contact supprimé.")}><Trash2 className="text-danger" /></Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between"><CardTitle className="text-sm">Journal d&apos;activité</CardTitle><Button size="sm" variant="outline" className="gap-2" onClick={() => setActivityOpen(true)}><MessageSquarePlus /> Ajouter</Button></CardHeader>
        <CardContent className="max-h-80 space-y-2 overflow-auto">
          {activities.length === 0 ? <p className="text-sm text-muted-foreground">Aucune activité.</p> : activities.map((item) => (
            <div key={item.id} className="group rounded-lg border p-3 text-sm"><div className="flex items-center justify-between"><Badge variant="outline">{item.type}</Badge><span className="text-xs text-muted-foreground">{new Date(item.happenedAt).toLocaleString("fr-FR")}</span></div><p className="mt-2 whitespace-pre-wrap">{item.content}</p><Button className="mt-1 opacity-0 group-hover:opacity-100" size="icon-xs" variant="ghost" title="Supprimer" onClick={() => run(() => deleteClientActivity(item.id), "Activité supprimée.")}><Trash2 className="text-danger" /></Button></div>
          ))}
        </CardContent>
      </Card>
    </div>

    <Card>
      <CardHeader className="flex-row items-center justify-between"><CardTitle className="text-sm">Documents client</CardTitle><Label className="cursor-pointer"><input type="file" className="hidden" disabled={pending} onChange={(event) => uploadFile(event.target.files?.[0])} /><span className="inline-flex h-8 items-center gap-2 rounded-lg border px-3 text-sm font-medium hover:bg-muted"><Upload /> Ajouter</span></Label></CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {files.length === 0 ? <p className="text-sm text-muted-foreground">Aucun document.</p> : files.map((file) => (
          <div key={file.id} className="flex items-center gap-2 rounded-lg border p-3"><FileText className="text-muted-foreground" /><a className="min-w-0 flex-1 truncate text-sm font-medium hover:underline" href={`/api/files/client/${file.id}`} target="_blank" rel="noreferrer">{file.name}</a><Button size="icon-xs" variant="ghost" title="Supprimer" onClick={() => deleteFile(file.id)}><Trash2 className="text-danger" /></Button></div>
        ))}
      </CardContent>
    </Card>

    <Dialog open={contactOpen} onOpenChange={setContactOpen}><DialogContent><form onSubmit={submitContact} className="space-y-4"><DialogHeader><DialogTitle>Nouveau contact</DialogTitle></DialogHeader><div className="grid gap-3 sm:grid-cols-2"><div><Label>Prénom</Label><Input value={contact.firstName} onChange={(event) => setContact({ ...contact, firstName: event.target.value })} required /></div><div><Label>Nom</Label><Input value={contact.lastName} onChange={(event) => setContact({ ...contact, lastName: event.target.value })} required /></div><div><Label>Email</Label><Input type="email" value={contact.email} onChange={(event) => setContact({ ...contact, email: event.target.value })} /></div><div><Label>Téléphone</Label><Input value={contact.phone} onChange={(event) => setContact({ ...contact, phone: event.target.value })} /></div><div className="sm:col-span-2"><Label>Rôle</Label><Input value={contact.role} onChange={(event) => setContact({ ...contact, role: event.target.value })} /></div><label className="flex items-center gap-2 text-sm"><Checkbox checked={contact.isPrimary} onCheckedChange={(checked) => setContact({ ...contact, isPrimary: checked === true })} /> Contact principal</label></div><DialogFooter><Button type="button" variant="outline" onClick={() => setContactOpen(false)}>Annuler</Button><Button type="submit" disabled={pending}>Ajouter</Button></DialogFooter></form></DialogContent></Dialog>

    <Dialog open={activityOpen} onOpenChange={setActivityOpen}><DialogContent><form onSubmit={submitActivity} className="space-y-4"><DialogHeader><DialogTitle>Nouvelle activité</DialogTitle></DialogHeader><div className="grid gap-3 sm:grid-cols-2"><div><Label>Type</Label><Select value={activity.type} onValueChange={(value) => setActivity({ ...activity, type: value ?? "NOTE" })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="NOTE">Note</SelectItem><SelectItem value="EMAIL">Email</SelectItem><SelectItem value="CALL">Appel</SelectItem><SelectItem value="MEETING">Réunion</SelectItem></SelectContent></Select></div><div><Label>Date</Label><Input type="datetime-local" value={activity.happenedAt} onChange={(event) => setActivity({ ...activity, happenedAt: event.target.value })} /></div></div><div><Label>Compte rendu</Label><textarea className="min-h-32 w-full rounded-lg border bg-background p-2.5 text-sm" value={activity.content} onChange={(event) => setActivity({ ...activity, content: event.target.value })} required /></div><DialogFooter><Button type="button" variant="outline" onClick={() => setActivityOpen(false)}>Annuler</Button><Button type="submit" disabled={pending}>Ajouter</Button></DialogFooter></form></DialogContent></Dialog>
  </>
}
