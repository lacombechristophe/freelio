"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { createService, updateService } from "@/actions/catalogue"

type Service = {
  id: string
  code?: string | null
  label: string
  description?: string | null
  priceCents: number
  unit: string
  tvaRate: number
  categoryId?: string | null
}

export function ServiceFormDialog({
  service,
  categories,
  open,
  onOpenChange,
}: {
  service?: Service
  categories: Array<{ id: string; name: string }>
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)
  const [form, setForm] = React.useState({
    code: service?.code ?? "",
    label: service?.label ?? "",
    description: service?.description ?? "",
    price: service ? (service.priceCents / 100).toString() : "",
    unit: service?.unit ?? "jour",
    tvaRate: service ? service.tvaRate.toString() : "20",
    categoryId: service?.categoryId ?? "",
  })

  React.useEffect(() => {
    if (open && service) {
      setForm({
        code: service.code ?? "",
        label: service.label,
        description: service.description ?? "",
        price: (service.priceCents / 100).toString(),
        unit: service.unit,
        tvaRate: service.tvaRate.toString(),
        categoryId: service.categoryId ?? "",
      })
    }
  }, [open, service])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    try {
      const payload = {
        code: form.code,
        label: form.label,
        description: form.description,
        priceCents: Math.round(Number(form.price || 0) * 100),
        unit: form.unit as "jour" | "heure" | "forfait" | "mois",
        tvaRate: Number(form.tvaRate || 0),
        categoryId: form.categoryId || undefined,
      }
      if (service) {
        await updateService(service.id, payload)
        toast.success("Service mis à jour.")
      } else {
        await createService(payload)
        toast.success("Service créé.")
      }
      onOpenChange(false)
      router.refresh()
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{service ? "Éditer le service" : "Nouveau service"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5 col-span-1">
              <Label htmlFor="code">Code</Label>
              <Input id="code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="label">Libellé *</Label>
              <Input id="label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Input id="description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="price">Prix (€)</Label>
              <Input id="price" type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Unité</Label>
              <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v ?? "jour" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="jour">Jour</SelectItem>
                  <SelectItem value="heure">Heure</SelectItem>
                  <SelectItem value="forfait">Forfait</SelectItem>
                  <SelectItem value="mois">Mois</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tva">TVA (%)</Label>
              <Input id="tva" type="number" min="0" max="100" step="0.1" value={form.tvaRate} onChange={(e) => setForm({ ...form, tvaRate: e.target.value })} />
            </div>
          </div>
          {categories.length > 0 && (
            <div className="space-y-1.5">
              <Label>Catégorie</Label>
              <Select value={form.categoryId} onValueChange={(v) => setForm({ ...form, categoryId: v ?? "" })}>
                <SelectTrigger><SelectValue placeholder="Aucune" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Annuler</DialogClose>
            <Button type="submit" disabled={pending}>{pending ? "…" : service ? "Enregistrer" : "Créer"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
