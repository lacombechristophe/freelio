"use client"

import { useEffect, useMemo, useState, useTransition, type FormEvent } from "react"
import { Building2, Loader2, MapPinned, Pencil, Plus, ShieldCheck, Store, Users, Warehouse } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { createAgency, updateAgency, updateAgencyAssignments } from "@/actions/agencies"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type AgencyData = Awaited<ReturnType<typeof import("@/actions/agencies").getAgencyManagement>>
type Agency = AgencyData["agencies"][number]

const KIND_LABELS: Record<string, string> = {
  STORE: "Magasin",
  INSTALLATION: "Pose",
  SERVICE: "SAV & entretien",
  MIXED: "Activité mixte",
}

type EditorState = {
  id?: string
  name: string
  code: string
  kind: "STORE" | "INSTALLATION" | "SERVICE" | "MIXED"
  address: string
  postalCode: string
  city: string
  phone: string
  email: string
  active: boolean
  isDefault: boolean
}

function editorState(agency?: Agency): EditorState {
  return {
    id: agency?.id,
    name: agency?.name ?? "",
    code: agency?.code ?? "",
    kind: agency?.kind as EditorState["kind"] ?? "MIXED",
    address: agency?.address ?? "",
    postalCode: agency?.postalCode ?? "",
    city: agency?.city ?? "",
    phone: agency?.phone ?? "",
    email: agency?.email ?? "",
    active: agency?.active ?? true,
    isDefault: agency?.isDefault ?? false,
  }
}

function displayMember(member: AgencyData["memberships"][number]) {
  return member.user.name || member.user.email || "Membre"
}

export function AgencyManagement({ initialData }: { initialData: AgencyData }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [assignments, setAssignments] = useState(() => Object.fromEntries(initialData.agencies.map((agency) => [
    agency.id,
    {
      membershipIds: agency.memberships.map((item) => item.membershipId),
      warehouseIds: agency.warehouses.map((item) => item.id),
    },
  ])))

  useEffect(() => {
    setAssignments((current) => {
      const next = { ...current }
      for (const agency of initialData.agencies) {
        next[agency.id] ??= {
          membershipIds: agency.memberships.map((item) => item.membershipId),
          warehouseIds: agency.warehouses.map((item) => item.id),
        }
      }
      return next
    })
  }, [initialData.agencies])

  const assignedWarehouseIds = useMemo(
    () => new Set(Object.values(assignments).flatMap((assignment) => assignment.warehouseIds)),
    [assignments],
  )
  const unassignedWarehouses = initialData.warehouses.filter((warehouse) => !assignedWarehouseIds.has(warehouse.id))

  function saveAgency(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editor) return
    startTransition(async () => {
      try {
        const payload = {
          name: editor.name,
          code: editor.code,
          kind: editor.kind,
          address: editor.address,
          postalCode: editor.postalCode,
          city: editor.city,
          phone: editor.phone,
          email: editor.email,
          active: editor.active,
          isDefault: editor.isDefault,
        }
        if (editor.id) await updateAgency(editor.id, payload)
        else await createAgency(payload)
        toast.success(editor.id ? "Agence mise à jour." : "Agence créée.")
        setEditor(null)
        router.refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Enregistrement impossible.")
      }
    })
  }

  function toggleAssignment(agencyId: string, field: "membershipIds" | "warehouseIds", id: string, checked: boolean) {
    setAssignments((current) => {
      const assignment = current[agencyId] ?? { membershipIds: [], warehouseIds: [] }
      const values = checked ? [...new Set([...assignment[field], id])] : assignment[field].filter((value) => value !== id)
      const next = { ...current, [agencyId]: { ...assignment, [field]: values } }
      if (field === "warehouseIds" && checked) {
        for (const otherAgencyId of Object.keys(next)) {
          if (otherAgencyId !== agencyId) next[otherAgencyId] = { ...next[otherAgencyId], warehouseIds: next[otherAgencyId].warehouseIds.filter((value) => value !== id) }
        }
      }
      return next
    })
  }

  function saveAssignments(agencyId: string) {
    const assignment = assignments[agencyId]
    startTransition(async () => {
      try {
        await updateAgencyAssignments({ agencyId, ...assignment })
        toast.success("Affectations enregistrées.")
        router.refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Affectations impossibles.")
      }
    })
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.38fr)]">
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div><CardTitle className="text-base">Périmètre de gestion</CardTitle><CardDescription>Une agence est une unité opérationnelle. L’entreprise reste l’entité juridique qui porte la facturation.</CardDescription></div>
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><MapPinned className="size-4" /></span>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-xl border p-4"><Building2 className="mb-3 size-4 text-primary" /><p className="font-semibold">Entreprise</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Identité légale, TVA et séquences de numérotation.</p></div>
            <div className="rounded-xl border p-4"><Store className="mb-3 size-4 text-primary" /><p className="font-semibold">Agence</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Magasin, secteur de pose, service ou activité mixte.</p></div>
            <div className="rounded-xl border p-4"><Warehouse className="mb-3 size-4 text-primary" /><p className="font-semibold">Dépôt</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Stock physique rattaché à une agence unique.</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Couverture</CardTitle><CardDescription>État de la structure active.</CardDescription></CardHeader>
          <CardContent className="grid grid-cols-3 gap-3">
            <div><p className="text-2xl font-semibold tabular-nums">{initialData.agencies.filter((agency) => agency.active).length}</p><p className="text-xs text-muted-foreground">agences</p></div>
            <div><p className="text-2xl font-semibold tabular-nums">{initialData.memberships.length}</p><p className="text-xs text-muted-foreground">membres</p></div>
            <div><p className="text-2xl font-semibold tabular-nums">{initialData.warehouses.length}</p><p className="text-xs text-muted-foreground">dépôts</p></div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div><h2 className="text-base font-semibold">Unités opérationnelles</h2><p className="mt-1 text-sm text-muted-foreground">Affectez les équipes et dépôts ; les sites et chantiers choisissent ensuite leur agence responsable.</p></div>
        <Button onClick={() => setEditor(editorState())}><Plus />Nouvelle agence</Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {initialData.agencies.map((agency) => {
          const assignment = assignments[agency.id] ?? { membershipIds: [], warehouseIds: [] }
          return (
            <Card key={agency.id} className={!agency.active ? "opacity-70" : undefined}>
              <CardHeader className="flex-row items-start justify-between gap-4">
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><CardTitle className="truncate text-base">{agency.name}</CardTitle>{agency.isDefault ? <Badge>Principale</Badge> : null}{!agency.active ? <Badge variant="secondary">Inactive</Badge> : null}</div><CardDescription className="mt-1">{agency.code} · {KIND_LABELS[agency.kind] || agency.kind}{agency.city ? ` · ${agency.city}` : ""}</CardDescription></div>
                <Button size="icon" variant="outline" aria-label={`Modifier ${agency.name}`} onClick={() => setEditor(editorState(agency))}><Pencil /></Button>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-2 gap-3 rounded-xl bg-muted/40 p-3 text-xs"><p><strong className="block text-sm tabular-nums text-foreground">{agency._count.customerSites}</strong>sites clients</p><p><strong className="block text-sm tabular-nums text-foreground">{agency._count.projects}</strong>chantiers</p></div>
                <section><div className="mb-2 flex items-center gap-2"><Users className="size-4 text-primary" /><h3 className="text-sm font-semibold">Équipe autorisée</h3></div><div className="grid gap-2 sm:grid-cols-2">{initialData.memberships.map((member) => <label key={member.id} className="flex min-h-11 items-center gap-3 rounded-lg border px-3 text-sm"><Checkbox checked={assignment.membershipIds.includes(member.id)} onCheckedChange={(checked) => toggleAssignment(agency.id, "membershipIds", member.id, checked === true)} /><span className="min-w-0"><span className="block truncate font-medium">{displayMember(member)}</span><span className="block text-[11px] text-muted-foreground">{member.role}</span></span></label>)}</div></section>
                <section><div className="mb-2 flex items-center gap-2"><Warehouse className="size-4 text-primary" /><h3 className="text-sm font-semibold">Dépôts rattachés</h3></div>{initialData.warehouses.length ? <div className="grid gap-2 sm:grid-cols-2">{initialData.warehouses.map((warehouse) => <label key={warehouse.id} className="flex min-h-11 items-center gap-3 rounded-lg border px-3 text-sm"><Checkbox checked={assignment.warehouseIds.includes(warehouse.id)} onCheckedChange={(checked) => toggleAssignment(agency.id, "warehouseIds", warehouse.id, checked === true)} /><span className="truncate">{warehouse.name} <span className="text-xs text-muted-foreground">· {warehouse.code}</span></span></label>)}</div> : <p className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground">Créez d’abord un dépôt depuis le centre opérationnel.</p>}</section>
                <div className="flex items-center justify-between gap-3 border-t pt-4"><p className="text-xs text-muted-foreground"><ShieldCheck className="mr-1 inline size-3.5" />Les rattachements sont isolés par entreprise.</p><Button size="sm" disabled={isPending || assignment.membershipIds.length === 0} onClick={() => saveAssignments(agency.id)}>{isPending ? <Loader2 className="animate-spin" /> : null}Enregistrer</Button></div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {unassignedWarehouses.length ? <Card className="border-warning/40 bg-warning/5"><CardContent className="flex gap-3 p-4 text-sm"><Warehouse className="mt-0.5 size-4 shrink-0 text-warning" /><div><p className="font-semibold">{unassignedWarehouses.length} dépôt{unassignedWarehouses.length > 1 ? "s" : ""} sans agence</p><p className="mt-1 text-xs text-muted-foreground">Affectez-les avant d’activer le filtrage opérationnel par agence.</p></div></CardContent></Card> : null}

      <Dialog open={Boolean(editor)} onOpenChange={(open) => !open && setEditor(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <form onSubmit={saveAgency} className="space-y-5">
            <DialogHeader><DialogTitle>{editor?.id ? "Modifier l’agence" : "Nouvelle agence"}</DialogTitle></DialogHeader>
            {editor ? <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="agency-name">Nom *</Label><Input id="agency-name" value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} required /></div>
              <div className="space-y-1.5"><Label htmlFor="agency-code">Code *</Label><Input id="agency-code" value={editor.code} onChange={(event) => setEditor({ ...editor, code: event.target.value.toUpperCase() })} required maxLength={30} /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label>Type d’activité</Label><Select value={editor.kind} onValueChange={(value) => setEditor({ ...editor, kind: (value || "MIXED") as EditorState["kind"] })}><SelectTrigger aria-label="Type d’activité"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(KIND_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="agency-address">Adresse</Label><Input id="agency-address" value={editor.address} onChange={(event) => setEditor({ ...editor, address: event.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="agency-postal">Code postal</Label><Input id="agency-postal" value={editor.postalCode} onChange={(event) => setEditor({ ...editor, postalCode: event.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="agency-city">Ville</Label><Input id="agency-city" value={editor.city} onChange={(event) => setEditor({ ...editor, city: event.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="agency-phone">Téléphone</Label><Input id="agency-phone" type="tel" value={editor.phone} onChange={(event) => setEditor({ ...editor, phone: event.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="agency-email">E-mail</Label><Input id="agency-email" type="email" value={editor.email} onChange={(event) => setEditor({ ...editor, email: event.target.value })} /></div>
              <label className="flex min-h-12 items-center gap-3 rounded-lg border p-3 text-sm"><Checkbox checked={editor.active} onCheckedChange={(checked) => setEditor({ ...editor, active: checked === true })} /><span><strong className="block">Agence active</strong><span className="text-xs text-muted-foreground">Disponible dans les nouvelles opérations.</span></span></label>
              <label className="flex min-h-12 items-center gap-3 rounded-lg border p-3 text-sm"><Checkbox checked={editor.isDefault} disabled={editor.id != null && editor.isDefault} onCheckedChange={(checked) => setEditor({ ...editor, isDefault: checked === true })} /><span><strong className="block">Agence principale</strong><span className="text-xs text-muted-foreground">Utilisée lorsque rien n’est sélectionné.</span></span></label>
            </div> : null}
            <DialogFooter><Button type="button" variant="outline" onClick={() => setEditor(null)}>Annuler</Button><Button type="submit" disabled={isPending}>{isPending ? <Loader2 className="animate-spin" /> : null}Enregistrer</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
