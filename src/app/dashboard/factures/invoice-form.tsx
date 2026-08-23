"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeft, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LineItemsEditor, Line } from "@/components/shared/line-items-editor"
import { createInvoice, updateInvoice } from "@/actions/factures"

type Invoice = {
  id: string
  clientId: string
  projectId?: string | null
  object: string
  type: string
  dueDate: Date | string
}

export function InvoiceForm({
  invoice,
  initialLines,
  clients,
  isTvaApplicable = true,
}: {
  invoice?: Invoice
  initialLines?: Line[]
  clients: Array<{ id: string; name: string }>
  isTvaApplicable?: boolean
}) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)
  const [clientId, setClientId] = React.useState(invoice?.clientId ?? "")
  const [object, setObject] = React.useState(invoice?.object ?? "")
  const defaultDue = new Date()
  defaultDue.setDate(defaultDue.getDate() + 30)
  const [dueDate, setDueDate] = React.useState(
    invoice?.dueDate
      ? new Date(invoice.dueDate).toISOString().slice(0, 10)
      : defaultDue.toISOString().slice(0, 10)
  )
  const [type, setType] = React.useState(invoice?.type ?? "STANDARD")
  const [lines, setLines] = React.useState<Line[]>(
    initialLines ?? [{ label: "", quantity: 1, unitPriceCents: 0, tvaRate: isTvaApplicable ? 20 : 0 }]
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const submittedLines = lines.map((line) => (isTvaApplicable ? line : { ...line, tvaRate: 0 }))
    if (!clientId) return toast.error("Sélectionnez un client.")
    if (!submittedLines.every((l) => l.label.trim())) return toast.error("Chaque ligne doit avoir un libellé.")
    setPending(true)
    try {
      const payload = {
        clientId, object, dueDate, type: type as "STANDARD" | "DEPOSIT",
        lines: submittedLines.map((l) => ({
          label: l.label,
          description: l.description,
          quantity: l.quantity,
          unitPriceCents: l.unitPriceCents,
          tvaRate: l.tvaRate,
        })),
      }
      if (invoice) {
        await updateInvoice(invoice.id, payload)
        toast.success("Facture mise à jour.")
        router.push(`/dashboard/factures/${invoice.id}`)
      } else {
        const created = await createInvoice(payload)
        toast.success("Facture créée.")
        router.push(`/dashboard/factures/${created.id}`)
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur.")
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/dashboard/factures">
          <Button type="button" variant="ghost" size="icon" aria-label="Retour aux factures"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div className="ml-auto">
          <Button type="submit" disabled={pending} className="gap-2">
            <Save className="h-4 w-4" />{pending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">En-tête</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Client *</Label>
              <Select value={clientId} onValueChange={(v) => setClientId(v ?? "")}>
                <SelectTrigger aria-label="Client de la facture"><SelectValue placeholder="Sélectionner…" /></SelectTrigger>
                <SelectContent>
                  {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v ?? "STANDARD")}>
                <SelectTrigger aria-label="Type de facture"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="STANDARD">Standard</SelectItem>
                  <SelectItem value="DEPOSIT">Acompte</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dueDate">Échéance *</Label>
              <Input id="dueDate" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="object">Objet *</Label>
            <Input id="object" value={object} onChange={(e) => setObject(e.target.value)} required />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Lignes</CardTitle></CardHeader>
        <CardContent>
          <LineItemsEditor lines={lines} onChange={setLines} isTvaApplicable={isTvaApplicable} />
        </CardContent>
      </Card>
    </form>
  )
}
