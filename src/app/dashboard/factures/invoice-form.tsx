"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeft, CheckCircle2, Circle, FileText, ReceiptText, Save, UserRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { computeLineTotals, LineItemsEditor, Line } from "@/components/shared/line-items-editor"
import { createInvoice, updateInvoice } from "@/actions/factures"

type Invoice = {
  id: string
  clientId: string
  projectId?: string | null
  object: string
  type: string
  dueDate: Date | string
}

function formatEuro(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100)
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
  const totals = React.useMemo(() => computeLineTotals(lines), [lines])
  const selectedClient = clients.find((client) => client.id === clientId)
  const readiness = [
    { label: "Client sélectionné", ready: Boolean(clientId) },
    { label: "Objet de facturation renseigné", ready: object.trim().length >= 2 },
    { label: "Prestations décrites", ready: lines.length > 0 && lines.every((line) => line.label.trim()) },
    { label: "Montant à émettre contrôlé", ready: totals.totalTtcCents > 0 },
  ]

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
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="sticky top-2 z-20 flex items-center gap-2 rounded-xl border border-border/80 bg-background/95 p-2 shadow-sm backdrop-blur-sm">
        <Link href="/dashboard/factures">
          <Button type="button" variant="ghost" size="icon" aria-label="Retour aux factures"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{invoice ? "Modifier la facture" : "Préparer la facture"}</p>
          <p className="text-xs text-muted-foreground">{type === "DEPOSIT" ? "Facture d’acompte" : "Facture standard"} · non émise</p>
        </div>
        <div className="ml-auto">
          <Button type="submit" disabled={pending} className="gap-2">
            <Save className="h-4 w-4" />{pending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-5">
          <Card className="workspace-panel">
            <CardHeader className="border-b"><div className="flex items-start gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-lg border bg-muted/40 text-xs font-semibold">01</span><div><CardTitle className="flex items-center gap-2 text-sm"><UserRound className="size-4 text-primary" />Destinataire et émission</CardTitle><p className="mt-1 text-xs leading-5 text-muted-foreground">Les coordonnées légales et les conditions de règlement seront reprises sur le PDF.</p></div></div></CardHeader>
            <CardContent className="space-y-4 p-5">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-1.5"><Label>Client *</Label><Select value={clientId} onValueChange={(value) => setClientId(value ?? "")}><SelectTrigger aria-label="Client de la facture"><SelectValue placeholder="Sélectionner…" /></SelectTrigger><SelectContent>{clients.map((client) => <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1.5"><Label>Type</Label><Select value={type} onValueChange={(value) => setType(value ?? "STANDARD")}><SelectTrigger aria-label="Type de facture"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="STANDARD">Standard</SelectItem><SelectItem value="DEPOSIT">Acompte</SelectItem></SelectContent></Select></div>
                <div className="space-y-1.5"><Label htmlFor="dueDate">Échéance *</Label><Input id="dueDate" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required /><p className="text-[11px] text-muted-foreground">30 jours proposés par défaut.</p></div>
              </div>
              <div className="space-y-1.5"><Label htmlFor="object">Objet *</Label><Input id="object" value={object} onChange={(event) => setObject(event.target.value)} placeholder="Ex : Solde de la rénovation du bassin" required /></div>
            </CardContent>
          </Card>

          <Card className="workspace-panel">
            <CardHeader className="border-b"><div className="flex items-start gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-lg border bg-muted/40 text-xs font-semibold">02</span><div><CardTitle className="flex items-center gap-2 text-sm"><FileText className="size-4 text-primary" />Prestations à facturer</CardTitle><p className="mt-1 text-xs leading-5 text-muted-foreground">Détaillez uniquement ce qui doit apparaître sur le document comptable.</p></div></div></CardHeader>
            <CardContent className="p-5"><LineItemsEditor lines={lines} onChange={setLines} isTvaApplicable={isTvaApplicable} /></CardContent>
          </Card>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-24">
          <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2"><ReceiptText className="size-4 text-primary" /><p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Synthèse</p></div>
            <div className="mt-4 space-y-3 border-b border-border pb-4 text-sm"><div><p className="text-xs text-muted-foreground">Client</p><p className="mt-0.5 truncate font-medium">{selectedClient?.name ?? "À sélectionner"}</p></div><div><p className="text-xs text-muted-foreground">Objet</p><p className="mt-0.5 line-clamp-2 font-medium">{object.trim() || "À renseigner"}</p></div></div>
            <div className="space-y-2 py-4"><div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Total HT</span><span className="font-medium tabular-nums">{formatEuro(totals.totalHtCents)}</span></div><div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">TVA</span><span className="font-medium tabular-nums">{formatEuro(totals.totalTvaCents)}</span></div><div className="flex items-end justify-between border-t border-border pt-3"><span className="font-semibold">Total TTC</span><span className="text-xl font-semibold tabular-nums">{formatEuro(totals.totalTtcCents)}</span></div></div>
            <Button type="submit" disabled={pending} className="w-full"><Save className="size-4" />{pending ? "Enregistrement…" : invoice ? "Enregistrer les modifications" : "Créer le brouillon"}</Button>
          </section>
          <section className="rounded-xl border border-border bg-background p-4"><p className="text-sm font-semibold">Contrôle avant émission</p><div className="mt-3 space-y-2.5">{readiness.map((item) => <div key={item.label} className="flex items-center gap-2 text-xs"><span className={item.ready ? "text-success" : "text-muted-foreground"}>{item.ready ? <CheckCircle2 className="size-4" /> : <Circle className="size-4" />}</span><span className={item.ready ? "text-foreground" : "text-muted-foreground"}>{item.label}</span></div>)}</div><p className="mt-4 border-t border-border pt-3 text-[11px] leading-5 text-muted-foreground">Le brouillon reste modifiable. La numérotation définitive et les contrôles Factur-X s’appliquent au moment de l’émission.</p></section>
        </aside>
      </div>
    </form>
  )
}
