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
import { createOpportunity, updateOpportunity } from "@/actions/pipeline"

type Opportunity = {
  id: string
  title: string
  status: string
  valueCents: number
  probability: number
  clientId: string
}

export function OpportunityFormDialog({
  opportunity,
  stages,
  clients,
  open,
  onOpenChange,
}: {
  opportunity?: Opportunity
  stages: Array<{ id: string; title: string }>
  clients: Array<{ id: string; name: string }>
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)
  const [form, setForm] = React.useState({
    title: opportunity?.title ?? "",
    clientId: opportunity?.clientId ?? "",
    status: opportunity?.status ?? stages[0]?.id ?? "PROSPECT",
    value: opportunity ? (opportunity.valueCents / 100).toString() : "",
    probability: opportunity ? opportunity.probability.toString() : "30",
  })

  React.useEffect(() => {
    if (open && opportunity) {
      setForm({
        title: opportunity.title,
        clientId: opportunity.clientId,
        status: opportunity.status,
        value: (opportunity.valueCents / 100).toString(),
        probability: opportunity.probability.toString(),
      })
    }
  }, [open, opportunity])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.clientId) return toast.error("Sélectionnez un client.")
    setPending(true)
    try {
      const payload = {
        title: form.title,
        clientId: form.clientId,
        status: form.status,
        valueCents: Math.round(Number(form.value || 0) * 100),
        probability: Math.min(100, Math.max(0, Number(form.probability || 0))),
      }
      if (opportunity) {
        await updateOpportunity(opportunity.id, payload)
        toast.success("Opportunité mise à jour.")
      } else {
        await createOpportunity(payload)
        toast.success("Opportunité créée.")
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
          <DialogTitle>{opportunity ? "Éditer l'opportunité" : "Nouvelle opportunité"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Titre *</Label>
            <Input
              id="title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Client *</Label>
            <Select value={form.clientId} onValueChange={(v) => setForm({ ...form, clientId: v ?? "" })}>
              <SelectTrigger><SelectValue placeholder="Sélectionner…" /></SelectTrigger>
              <SelectContent>
                {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Étape</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v ?? "PROSPECT" })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}
                <SelectItem value="LOST">Perdu</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="value">Valeur (€)</Label>
              <Input
                id="value" type="number" min="0" step="0.01"
                value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prob">Probabilité (%)</Label>
              <Input
                id="prob" type="number" min="0" max="100" step="1"
                value={form.probability}
                onChange={(e) => setForm({ ...form, probability: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Annuler</DialogClose>
            <Button type="submit" disabled={pending}>{pending ? "…" : opportunity ? "Enregistrer" : "Créer"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
