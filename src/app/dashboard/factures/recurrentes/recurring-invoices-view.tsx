"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, CalendarClock, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import {
  createRecurringInvoice,
  deleteRecurringInvoice,
  toggleRecurringInvoice,
} from "@/actions/factures"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { LineItemsEditor, type Line } from "@/components/shared/line-items-editor"
import { useConfirm } from "@/components/shared/confirm-provider"
import { PageHeader } from "@/components/shared/page-header"

type Recurring = {
  id: string
  label: string
  frequency: string
  nextGenDate: Date | string
  lastGenDate?: Date | string | null
  isActive: boolean
  client: { id: string; name: string }
  occurrences: Array<{ id: string }>
}

const FREQUENCY_LABELS: Record<string, string> = {
  MONTHLY: "Mensuelle",
  QUARTERLY: "Trimestrielle",
  ANNUALLY: "Annuelle",
}

function dateInput(days = 0) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

export function RecurringInvoicesView({
  recurring,
  clients,
}: {
  recurring: Recurring[]
  clients: Array<{ id: string; name: string }>
}) {
  const router = useRouter()
  const confirmDialog = useConfirm()
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [clientId, setClientId] = React.useState("")
  const [label, setLabel] = React.useState("")
  const [object, setObject] = React.useState("")
  const [frequency, setFrequency] = React.useState("MONTHLY")
  const [nextGenDate, setNextGenDate] = React.useState(dateInput())
  const [dueDays, setDueDays] = React.useState(30)
  const [lines, setLines] = React.useState<Line[]>([
    { label: "", quantity: 1, unitPriceCents: 0, tvaRate: 20 },
  ])

  function reset() {
    setClientId("")
    setLabel("")
    setObject("")
    setFrequency("MONTHLY")
    setNextGenDate(dateInput())
    setDueDays(30)
    setLines([{ label: "", quantity: 1, unitPriceCents: 0, tvaRate: 20 }])
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    try {
      await createRecurringInvoice({
        clientId,
        label,
        object,
        frequency: frequency as "MONTHLY" | "QUARTERLY" | "ANNUALLY",
        nextGenDate,
        dueDays,
        lines,
      })
      toast.success("Facturation récurrente créée.")
      setOpen(false)
      reset()
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Création impossible.")
    } finally {
      setPending(false)
    }
  }

  async function toggle(item: Recurring, isActive: boolean) {
    try {
      await toggleRecurringInvoice(item.id, isActive)
      toast.success(isActive ? "Récurrence activée." : "Récurrence suspendue.")
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Mise à jour impossible.")
    }
  }

  async function remove(item: Recurring) {
    if (!(await confirmDialog({
      title: `Supprimer « ${item.label} » ?`,
      description: "Les factures déjà générées sont conservées.",
      confirmLabel: "Supprimer",
      destructive: true,
    }))) return
    try {
      await deleteRecurringInvoice(item.id)
      toast.success("Récurrence supprimée.")
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Suppression impossible.")
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/dashboard/factures">
          <Button variant="ghost" size="icon" title="Retour aux factures"><ArrowLeft /></Button>
        </Link>
        <PageHeader className="flex-1" eyebrow="Automatisation" title="Facturation récurrente" description="Planifiez les échéances qui doivent générer automatiquement de nouveaux brouillons." />
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button className="gap-2" />}>
            <Plus /> Nouvelle récurrence
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
            <form onSubmit={submit} className="space-y-5">
              <DialogHeader><DialogTitle className="flex items-center gap-2"><CalendarClock /> Nouvelle récurrence</DialogTitle></DialogHeader>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5"><Label>Libellé *</Label><Input value={label} onChange={(event) => setLabel(event.target.value)} required /></div>
                <div className="space-y-1.5"><Label>Client *</Label>
                  <Select value={clientId} onValueChange={(value) => setClientId(value ?? "")}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                    <SelectContent>{clients.map((client) => <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 sm:col-span-2"><Label>Objet de la facture *</Label><Input value={object} onChange={(event) => setObject(event.target.value)} required /></div>
                <div className="space-y-1.5"><Label>Fréquence</Label>
                  <Select value={frequency} onValueChange={(value) => setFrequency(value ?? "MONTHLY")}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="MONTHLY">Mensuelle</SelectItem><SelectItem value="QUARTERLY">Trimestrielle</SelectItem><SelectItem value="ANNUALLY">Annuelle</SelectItem></SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>Première génération</Label><Input type="date" value={nextGenDate} onChange={(event) => setNextGenDate(event.target.value)} required /></div>
                <div className="space-y-1.5"><Label>Délai de paiement (jours)</Label><Input type="number" min={0} max={365} value={dueDays} onChange={(event) => setDueDays(Number(event.target.value))} /></div>
              </div>
              <LineItemsEditor lines={lines} onChange={setLines} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
                <Button type="submit" disabled={pending || !clientId}>{pending ? "Création…" : "Créer"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Libellé</TableHead><TableHead>Client</TableHead><TableHead>Fréquence</TableHead>
            <TableHead>Prochaine génération</TableHead><TableHead>Générées</TableHead><TableHead>Active</TableHead><TableHead />
          </TableRow></TableHeader>
          <TableBody>
            {recurring.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="py-14 text-center text-muted-foreground">Aucune facturation récurrente.</TableCell></TableRow>
            ) : recurring.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.label}</TableCell>
                <TableCell>{item.client.name}</TableCell>
                <TableCell><Badge variant="secondary">{FREQUENCY_LABELS[item.frequency] ?? item.frequency}</Badge></TableCell>
                <TableCell>{new Date(item.nextGenDate).toLocaleDateString("fr-FR")}</TableCell>
                <TableCell>{item.occurrences.length}</TableCell>
                <TableCell>
                  <Switch checked={item.isActive} onCheckedChange={(checked) => toggle(item, checked)} />
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" title="Supprimer" onClick={() => remove(item)}><Trash2 className="text-danger" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
