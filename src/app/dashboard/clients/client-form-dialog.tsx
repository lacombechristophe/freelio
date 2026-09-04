"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Building2, MapPin, ShieldCheck } from "lucide-react"
import { toast } from "sonner"

import { createClient, updateClient } from "@/actions/clients"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type Client = {
  id: string
  name: string
  type: string
  siret?: string | null
  tvaNumber?: string | null
  address?: string | null
}

export function ClientFormDialog({
  trigger,
  client,
  open: controlledOpen,
  onOpenChange,
}: {
  trigger?: React.ReactNode
  client?: Client
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const router = useRouter()
  const [internalOpen, setInternalOpen] = React.useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = onOpenChange ?? setInternalOpen

  const [pending, setPending] = React.useState(false)
  const [form, setForm] = React.useState({
    name: client?.name ?? "",
    type: client?.type ?? "ENTERPRISE",
    siret: client?.siret ?? "",
    tvaNumber: client?.tvaNumber ?? "",
    address: client?.address ?? "",
  })

  React.useEffect(() => {
    if (!open) return
    setForm({
      name: client?.name ?? "",
      type: client?.type ?? "ENTERPRISE",
      siret: client?.siret ?? "",
      tvaNumber: client?.tvaNumber ?? "",
      address: client?.address ?? "",
    })
  }, [open, client])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    try {
      if (client) {
        await updateClient(client.id, form)
        toast.success("Client mis à jour.")
      } else {
        await createClient(form)
        toast.success("Client créé.")
      }
      setOpen(false)
      router.refresh()
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Erreur lors de l'enregistrement.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger render={<span />}>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mb-1 grid size-10 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
            <Building2 className="size-4" />
          </div>
          <DialogTitle>{client ? "Éditer le client" : "Nouveau client"}</DialogTitle>
          <DialogDescription>Créez le dossier de référence qui reliera contacts, bassin, devis, chantier, factures et SAV.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Building2 className="size-4 text-primary" />
              <div>
                <h3 className="text-sm font-semibold">Identité du dossier</h3>
                <p className="text-xs text-muted-foreground">Nom affiché partout dans l’espace de travail.</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="name">Nom *</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Type *</Label>
              <Select value={form.type} onValueChange={(value) => setForm({ ...form, type: value ?? "ENTERPRISE" })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ENTERPRISE">Entreprise</SelectItem>
                  <SelectItem value="INDIVIDUAL">Particulier</SelectItem>
                  <SelectItem value="ADMINISTRATION">Administration</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </section>
          <section className="space-y-4 border-t border-border/80 pt-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary" />
              <div>
                <h3 className="text-sm font-semibold">Informations administratives</h3>
                <p className="text-xs text-muted-foreground">Utilisées pour les documents commerciaux et fiscaux.</p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="siret">SIRET</Label>
                <Input
                  id="siret"
                  inputMode="numeric"
                  value={form.siret}
                  onChange={(event) => setForm({ ...form, siret: event.target.value.replace(/\D/g, "").slice(0, 14) })}
                  maxLength={14}
                  placeholder="14 chiffres"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tvaNumber">N° TVA</Label>
                <Input
                  id="tvaNumber"
                  value={form.tvaNumber}
                  onChange={(event) => setForm({ ...form, tvaNumber: event.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="address" className="flex items-center gap-1.5">
                <MapPin className="size-3.5 text-muted-foreground" />
                Adresse *
              </Label>
              <Input
                id="address"
                value={form.address}
                onChange={(event) => setForm({ ...form, address: event.target.value })}
                required
              />
            </div>
          </section>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Annuler</DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "…" : client ? "Enregistrer" : "Créer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
