"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { updateSupplier, setSupplierActive } from "@/actions/suppliers"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"

type Supplier = {
  id: string; name: string; code: string | null; contactName: string | null; email: string | null;
  phone: string | null; address: string | null; paymentTerms: string | null; deliveryDays: number | null; active: boolean; updatedAt: string
}
const fields = [
  ["name", "Nom"], ["code", "Code"], ["contactName", "Contact"], ["email", "E-mail"],
  ["phone", "Téléphone"], ["address", "Adresse"], ["paymentTerms", "Conditions de paiement"], ["deliveryDays", "Délai de livraison (jours)"],
] as const

export function SupplierActions({ supplier, canManage }: { supplier: Supplier; canManage: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()
  // The displayed version belongs to this form, even if a background refresh
  // supplies a newer page. An open form must not silently adopt that revision.
  const [revision, setRevision] = useState(supplier.updatedAt)
  function edit() { setRevision(supplier.updatedAt); setError(""); setOpen(true) }
  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const values = Object.fromEntries(fields.map(([key]) => [key, String(form.get(key) ?? "")]))
    startTransition(async () => {
      try { await updateSupplier({ ...values, supplierId: supplier.id, expectedUpdatedAt: revision }); setOpen(false); setError(""); router.refresh() }
      catch (failure) { setError(failure instanceof Error ? failure.message : "Modification impossible.") }
    })
  }
  function toggle() {
    startTransition(async () => {
      try { await setSupplierActive({ supplierId: supplier.id, active: !supplier.active, expectedUpdatedAt: supplier.updatedAt }); setConfirm(false); setError(""); router.refresh() }
      catch (failure) { setError(failure instanceof Error ? failure.message : "Modification impossible.") }
    })
  }
  if (!canManage) return null
  return <>
    <Button demoMutation variant="outline" onClick={edit}>Modifier</Button>
    <Button demoMutation variant="outline" disabled={pending} onClick={() => { setError(""); if (supplier.active) setConfirm(true); else toggle() }}>{supplier.active ? "Désactiver" : "Réactiver"}</Button>
    {!open && !confirm && error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
    <Dialog open={open} onOpenChange={next => { if (!pending) setOpen(next) }}>
      <DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>Modifier le fournisseur</DialogTitle></DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">{fields.map(([key, label]) => <div key={key} className="space-y-1.5">
            <Label htmlFor={`supplier-${key}`}>{label}</Label>
            <Input id={`supplier-${key}`} name={key} defaultValue={supplier[key] ?? ""} required={key === "name"} type={key === "email" ? "email" : key === "deliveryDays" ? "number" : "text"} min={key === "deliveryDays" ? 0 : undefined} max={key === "deliveryDays" ? 365 : undefined} disabled={pending} />
          </div>)}</div>
          {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
          <DialogFooter><Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>Annuler</Button><Button demoMutation type="submit" disabled={pending}>Enregistrer</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    <Dialog open={confirm} onOpenChange={next => { if (!pending) setConfirm(next) }}><DialogContent>
      <DialogHeader><DialogTitle>Désactiver ce fournisseur ?</DialogTitle><DialogDescription>Les rattachements et l’historique seront conservés. Aucun nouveau produit ou achat ne pourra lui être rattaché.</DialogDescription></DialogHeader>
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      <DialogFooter><Button variant="outline" disabled={pending} onClick={() => setConfirm(false)}>Annuler</Button><Button demoMutation disabled={pending} onClick={toggle}>Désactiver le fournisseur</Button></DialogFooter>
    </DialogContent></Dialog>
  </>
}
