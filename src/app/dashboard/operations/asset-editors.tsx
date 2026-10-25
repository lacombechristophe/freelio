"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { saveSite, saveEquipment, changeSiteActivity, changeEquipmentActivity } from "@/actions/asset-commands"
import type { getCustomerSiteDirectory, getEquipmentDirectory } from "@/actions/operations-assets"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { OperationsProductChoice, useOperationsProductChoices } from "@/components/shared/operations-product-choice"

export type SiteEditorRecord = Awaited<ReturnType<typeof getCustomerSiteDirectory>>["items"][number]
export type EquipmentEditorRecord = Awaited<ReturnType<typeof getEquipmentDirectory>>["items"][number]
export type AssetActivityRecord = { kind: "site" | "equipment"; id: string; label: string; archivedAt: string | null; updatedAt: string }

const siteFields = [["label", "Libellé", 120], ["kind", "Type", 40], ["address1", "Adresse", 200], ["address2", "Complément d’adresse", 2_000],
  ["postalCode", "Code postal", 20], ["city", "Ville", 100], ["country", "Pays", 100]] as const
const equipmentFields = [["label", "Libellé", 160], ["category", "Catégorie", 100], ["manufacturer", "Fabricant", 120], ["model", "Modèle", 120], ["serialNumber", "Numéro de série", 120]] as const

export function SiteEditorDialog({ site, onClose, onSaved }: { site: SiteEditorRecord; onClose: () => void; onSaved: () => void }) {
  const [values, setValues] = useState(() => ({ label: site.label, kind: site.kind, address1: site.address1, address2: site.address2 ?? "",
    postalCode: site.postalCode ?? "", city: site.city ?? "", country: site.country, accessNotes: site.accessNotes ?? "",
    latitude: site.latitude === null ? "" : String(site.latitude), longitude: site.longitude === null ? "" : String(site.longitude) }))
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()
  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    startTransition(async () => {
      try {
        const result = await saveSite({ ...values, siteId: site.id, expectedUpdatedAt: site.updatedAt })
        if (!result.success) { setError(result.error); return }
        onSaved(); onClose()
      } catch { setError("La modification a échoué. Votre saisie est conservée.") }
    })
  }
  return <Dialog open onOpenChange={open => { if (!open && !pending) onClose() }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
    <DialogHeader><DialogTitle>Modifier le site</DialogTitle><DialogDescription>{site.client.name} · {site.agency?.name ?? "Sans agence"}. Les rattachements et l’historique seront conservés.</DialogDescription></DialogHeader>
    <form onSubmit={save} aria-busy={pending} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">{siteFields.map(([field, label, maximum]) => <div key={field} className="space-y-1.5">
        <Label htmlFor={`edit-site-${field}`}>{label}</Label><Input id={`edit-site-${field}`} value={values[field]} maxLength={maximum} minLength={field === "address1" ? 3 : ["label", "kind", "country"].includes(field) ? 2 : undefined}
          required={["label", "kind", "address1", "country"].includes(field)} disabled={pending} onChange={event => setValues(current => ({ ...current, [field]: event.target.value }))} />
      </div>)}
        {(["latitude", "longitude"] as const).map(field => <div key={field} className="space-y-1.5"><Label htmlFor={`edit-site-${field}`}>{field === "latitude" ? "Latitude" : "Longitude"}</Label>
          <Input id={`edit-site-${field}`} type="number" step="any" min={field === "latitude" ? -90 : -180} max={field === "latitude" ? 90 : 180} value={values[field]} disabled={pending} onChange={event => setValues(current => ({ ...current, [field]: event.target.value }))} />
        </div>)}
      </div>
      <div className="space-y-1.5"><Label htmlFor="edit-site-accessNotes">Consignes d’accès</Label><Textarea id="edit-site-accessNotes" value={values.accessNotes} maxLength={2_000} disabled={pending} onChange={event => setValues(current => ({ ...current, accessNotes: event.target.value }))} /></div>
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      <DialogFooter><Button variant="outline" type="button" disabled={pending} onClick={onClose}>Annuler</Button><Button demoMutation type="submit" disabled={pending}>{pending ? "Enregistrement…" : "Enregistrer"}</Button></DialogFooter>
    </form>
  </DialogContent></Dialog>
}

export function EquipmentEditorDialog({ equipment, onClose, onSaved }: { equipment: EquipmentEditorRecord; onClose: () => void; onSaved: () => void }) {
  const [values, setValues] = useState(() => ({ label: equipment.label, category: equipment.category ?? "", manufacturer: equipment.manufacturer ?? "", model: equipment.model ?? "",
    serialNumber: equipment.serialNumber ?? "", productId: equipment.productId, installedAt: equipment.installedAt, warrantyUntil: equipment.warrantyUntil, notes: equipment.notes ?? "" }))
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()
  const products = useOperationsProductChoices(values.productId ?? "", false, true, equipment.id)
  const blocked = pending || Boolean(values.productId && !products.ready)
  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (blocked) return
    startTransition(async () => {
      try {
        const result = await saveEquipment({ ...values, equipmentId: equipment.id, expectedUpdatedAt: equipment.updatedAt })
        if (!result.success) { setError(result.error); return }
        onSaved(); onClose()
      } catch { setError("La modification a échoué. Votre saisie est conservée.") }
    })
  }
  return <Dialog open onOpenChange={open => { if (!open && !pending) onClose() }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
    <DialogHeader><DialogTitle>Modifier l’équipement</DialogTitle><DialogDescription>{equipment.site.client.name} · {equipment.site.label}. Le site, le statut technique et l’historique seront conservés.</DialogDescription></DialogHeader>
    <form onSubmit={save} aria-busy={pending} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">{equipmentFields.map(([field, label, maximum]) => <div key={field} className="space-y-1.5">
        <Label htmlFor={`edit-equipment-${field}`}>{label}</Label><Input id={`edit-equipment-${field}`} value={values[field]} maxLength={maximum} minLength={field === "label" ? 2 : undefined} required={field === "label"} disabled={pending} onChange={event => setValues(current => ({ ...current, [field]: event.target.value }))} />
      </div>)}
        {(["installedAt", "warrantyUntil"] as const).map(field => <div key={field} className="space-y-1.5"><Label htmlFor={`edit-equipment-${field}`}>{field === "installedAt" ? "Date d’installation" : "Fin de garantie"}</Label>
          <Input id={`edit-equipment-${field}`} type="date" value={values[field]?.slice(0, 10) ?? ""} disabled={pending} onChange={event => {
            const value = event.target.value
            setValues(current => ({ ...current, [field]: value ? `${value}T00:00:00.000Z` : null }))
          }} />
        </div>)}
      </div>
      <div className="space-y-1.5"><Label htmlFor="edit-equipment-product">Produit catalogue</Label><OperationsProductChoice choices={products} name="edit-equipment-product" onChange={productId => setValues(current => ({ ...current, productId: productId || null }))} disabled={pending} /></div>
      <div className="space-y-1.5"><Label htmlFor="edit-equipment-notes">Notes</Label><Textarea id="edit-equipment-notes" value={values.notes} maxLength={2_000} disabled={pending} onChange={event => setValues(current => ({ ...current, notes: event.target.value }))} /></div>
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      <DialogFooter><Button variant="outline" type="button" disabled={pending} onClick={onClose}>Annuler</Button><Button demoMutation type="submit" disabled={blocked}>{pending ? "Enregistrement…" : "Enregistrer"}</Button></DialogFooter>
    </form>
  </DialogContent></Dialog>
}

export function AssetActivityDialog({ record, onClose, onSaved }: { record: AssetActivityRecord; onClose: () => void; onSaved: () => void }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState("")
  const activating = record.archivedAt !== null
  function save() {
    startTransition(async () => {
      try {
        const action = record.kind === "site" ? changeSiteActivity : changeEquipmentActivity
        const result = await action({ id: record.id, active: activating, expectedUpdatedAt: record.updatedAt })
        if (!result.success) { setError(result.error); return }
        onSaved(); onClose()
      } catch { setError("La modification a échoué. Votre saisie est conservée.") }
    })
  }
  return <Dialog open onOpenChange={open => { if (!open && !pending) onClose() }}><DialogContent>
    <DialogHeader><DialogTitle>{activating ? "Réactiver" : "Désactiver"} « {record.label} » ?</DialogTitle>
      <DialogDescription>{activating ? record.kind === "site" ? "Le site pourra de nouveau être utilisé pour de nouveaux dossiers." : "L’équipement pourra de nouveau être utilisé pour de nouveaux dossiers ; son site doit être actif." :
        record.kind === "site" ? "Le site doit être sans équipement référencé ni dossier en cours. Ses coordonnées et historiques seront conservés ; aucun nouveau rattachement ne sera possible." :
        "Les dossiers SAV, interventions et contrats en cours doivent être terminés. Le statut technique et les historiques seront conservés ; aucun nouveau rattachement ne sera possible."}</DialogDescription>
    </DialogHeader>
    {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
    <DialogFooter><Button variant="outline" disabled={pending} onClick={onClose}>Annuler</Button><Button demoMutation disabled={pending} onClick={save}>{activating ? "Réactiver le référencement" : "Désactiver le référencement"}</Button></DialogFooter>
  </DialogContent></Dialog>
}

export function EquipmentManagementButtons({ equipment, canManage }: { equipment: EquipmentEditorRecord; canManage: boolean }) {
  const router = useRouter()
  const [editor, setEditor] = useState<EquipmentEditorRecord | null>(null)
  const [activity, setActivity] = useState<AssetActivityRecord | null>(null)
  if (!canManage) return null
  return <>
    <Button demoMutation variant="outline" onClick={() => setEditor(equipment)}>Modifier</Button>
    <Button demoMutation variant="outline" onClick={() => setActivity({ ...equipment, kind: "equipment" })}>{equipment.archivedAt ? "Réactiver" : "Désactiver"}</Button>
    {editor ? <EquipmentEditorDialog equipment={editor} onClose={() => setEditor(null)} onSaved={() => router.refresh()} /> : null}
    {activity ? <AssetActivityDialog record={activity} onClose={() => setActivity(null)} onSaved={() => router.refresh()} /> : null}
  </>
}
