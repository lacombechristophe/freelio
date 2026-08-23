"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createClient, updateClient } from "@/actions/clients"

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
    if (open && client) {
      setForm({
        name: client.name,
        type: client.type,
        siret: client.siret ?? "",
        tvaNumber: client.tvaNumber ?? "",
        address: client.address ?? "",
      })
    }
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
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de l'enregistrement.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger render={<span />}>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{client ? "Éditer le client" : "Nouveau client"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Nom *</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Type *</Label>
            <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v ?? "ENTERPRISE" })}>
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
          <div className="space-y-1.5">
            <Label htmlFor="siret">SIRET</Label>
            <Input
              id="siret"
              value={form.siret}
              onChange={(e) => setForm({ ...form, siret: e.target.value })}
              maxLength={14}
              placeholder="14 chiffres"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tvaNumber">N° TVA</Label>
            <Input
              id="tvaNumber"
              value={form.tvaNumber}
              onChange={(e) => setForm({ ...form, tvaNumber: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="address">Adresse *</Label>
            <Input
              id="address"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              required
            />
          </div>
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
