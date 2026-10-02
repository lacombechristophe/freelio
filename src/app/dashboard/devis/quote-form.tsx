"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeft, CheckCircle2, Circle, FileText, Save, UserRound } from "lucide-react"
import Link from "next/link"
import { FormError } from "@/components/shared/form-error"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { computeLineTotals, LineItemsEditor, type Line } from "@/components/shared/line-items-editor"
import { createQuote, updateQuote } from "@/actions/devis"
import { ProductConfigurator } from "./product-configurator"

type ProductCatalog = Awaited<ReturnType<typeof import("@/actions/products").getQuoteProductCatalog>>

type Quote = {
  id: string
  clientId: string
  projectId?: string | null
  object: string
  validUntil?: Date | string | null
}

function defaultValidityDate() {
  const date = new Date()
  date.setDate(date.getDate() + 30)
  return date.toISOString().slice(0, 10)
}

function formatEuro(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100)
}

export function QuoteForm({
  quote,
  initialLines,
  initialClientId,
  clients,
  productCatalog,
  isTvaApplicable = true,
}: {
  quote?: Quote
  initialLines?: Line[]
  initialClientId?: string
  clients: Array<{ id: string; name: string }>
  productCatalog: ProductCatalog
  isTvaApplicable?: boolean
}) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)
  const [formError, setFormError] = React.useState("")
  const [clientId, setClientId] = React.useState(quote?.clientId ?? initialClientId ?? "")
  const [object, setObject] = React.useState(quote?.object ?? "")
  const [validUntil, setValidUntil] = React.useState(
    quote?.validUntil ? new Date(quote.validUntil).toISOString().slice(0, 10) : defaultValidityDate()
  )
  const [lines, setLines] = React.useState<Line[]>(
    initialLines ?? [{ label: "", quantity: 1, unitPriceCents: 0, tvaRate: isTvaApplicable ? 20 : 0 }]
  )
  const totals = React.useMemo(() => computeLineTotals(lines), [lines])
  const selectedClient = clients.find((client) => client.id === clientId)
  const readiness = [
    { label: "Client sélectionné", ready: Boolean(clientId) },
    { label: "Objet du devis renseigné", ready: object.trim().length >= 2 },
    { label: "Prestations décrites", ready: lines.length > 0 && lines.every((line) => line.label.trim()) },
    { label: "Chiffrage à contrôler", ready: totals.totalTtcCents > 0 },
  ]

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (pending) return
    setFormError("")
    const submittedLines = lines.map((line) => (isTvaApplicable ? line : { ...line, tvaRate: 0 }))
    if (!clientId) return setFormError("Sélectionnez un client avant d’enregistrer le document.")
    if (submittedLines.length === 0 || !submittedLines.every((l) => l.label.trim())) {
      return setFormError("Renseignez le libellé de chaque prestation avant d’enregistrer.")
    }
    setPending(true)
    try {
      const payload = {
        clientId,
        object,
        validUntil: validUntil || undefined,
        lines: submittedLines.map((l) => ({
          label: l.label,
          description: l.description,
          quantity: l.quantity,
          unitPriceCents: l.unitPriceCents,
          tvaRate: l.tvaRate,
          productId: l.productId || undefined,
          configuration: l.configuration,
          unitCostCents: l.unitCostCents,
          listUnitPriceCents: l.listUnitPriceCents,
          discountRate: l.discountRate ?? 0,
        })),
      }
      if (quote) {
        await updateQuote(quote.id, payload)
        toast.success("Devis mis à jour.")
        router.push(`/dashboard/devis/${quote.id}`)
      } else {
        const created = await createQuote(payload)
        toast.success("Devis créé.")
        router.push(`/dashboard/devis/${created.id}`)
      }
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Impossible d’enregistrer. Vos modifications sont conservées ; réessayez.")
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="sticky top-2 z-20 flex items-center gap-2 rounded-lg border border-border/80 bg-background p-2">
        <Link href="/dashboard/devis">
          <Button type="button" variant="ghost" size="icon" aria-label="Retour aux devis">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{quote ? "Modifier le devis" : "Préparer le devis"}</p>
          <p className="text-xs text-muted-foreground">Brouillon non envoyé</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button type="submit" disabled={pending} className="gap-2">
            <Save className="h-4 w-4" />
            {pending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
      </div>

      <FormError message={formError} />
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-5">
          <section className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="flex items-start gap-3 border-b border-border px-5 py-4">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg border bg-muted/40 text-xs font-semibold">01</span>
              <div>
                <h2 className="flex items-center gap-2 text-sm font-semibold"><UserRound className="size-4 text-primary" />Destinataire et objet</h2>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">Les informations légales du client seront reprises automatiquement dans le PDF.</p>
              </div>
            </div>
            <div className="space-y-4 p-5">
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
                <div className="space-y-1.5">
                  <Label>Client *</Label>
                  <Select value={clientId} onValueChange={(value) => setClientId(value ?? "")}>
                    <SelectTrigger aria-label="Client du devis"><SelectValue placeholder="Sélectionner un client…" /></SelectTrigger>
                    <SelectContent>{clients.map((client) => <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="validUntil">Valide jusqu’au</Label>
                  <Input id="validUntil" type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} />
                  <p className="text-[11px] text-muted-foreground">30 jours proposés par défaut.</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="object">Objet *</Label>
                <Input id="object" value={object} onChange={(event) => setObject(event.target.value)} placeholder="Ex : Fourniture et pose d’une couverture de piscine" required />
              </div>
            </div>
          </section>

          <section className="space-y-4 rounded-lg border border-border bg-card p-5">
            <div className="flex items-start gap-3 border-b border-border pb-4">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg border bg-muted/40 text-xs font-semibold">02</span>
              <div>
                <h2 className="flex items-center gap-2 text-sm font-semibold"><FileText className="size-4 text-primary" />Prestations et chiffrage</h2>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">Utilisez le catalogue pour les produits configurés ou une structure métier pour démarrer plus vite.</p>
              </div>
            </div>
            <ProductConfigurator
              catalog={productCatalog}
              isTvaApplicable={isTvaApplicable}
              onAdd={(line) => setLines((current) => current.length === 1 && !current[0].label.trim() && current[0].unitPriceCents === 0 ? [line] : [...current, line])}
            />
            <LineItemsEditor lines={lines} onChange={setLines} isTvaApplicable={isTvaApplicable} />
          </section>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-24">
          <section className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs font-semibold tracking-normal text-muted-foreground">Synthèse</p>
            <div className="mt-4 space-y-3 border-b border-border pb-4 text-sm">
              <div><p className="text-xs text-muted-foreground">Client</p><p className="mt-0.5 truncate font-medium">{selectedClient?.name ?? "À sélectionner"}</p></div>
              <div><p className="text-xs text-muted-foreground">Objet</p><p className="mt-0.5 line-clamp-2 font-medium">{object.trim() || "À renseigner"}</p></div>
            </div>
            <div className="space-y-2 py-4">
              <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Total HT</span><span className="font-medium tabular-nums">{formatEuro(totals.totalHtCents)}</span></div>
              <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">TVA</span><span className="font-medium tabular-nums">{formatEuro(totals.totalTvaCents)}</span></div>
              <div className="flex items-end justify-between border-t border-border pt-3"><span className="font-semibold">Total TTC</span><span className="text-xl font-semibold tabular-nums">{formatEuro(totals.totalTtcCents)}</span></div>
            </div>
            <Button type="submit" disabled={pending} className="w-full"><Save className="size-4" />{pending ? "Enregistrement…" : quote ? "Enregistrer les modifications" : "Créer le brouillon"}</Button>
          </section>

          <section className="rounded-lg border border-border bg-background p-4">
            <p className="text-sm font-semibold">Contrôle avant création</p>
            <div className="mt-3 space-y-2.5">
              {readiness.map((item) => <div key={item.label} className="flex items-center gap-2 text-xs"><span className={item.ready ? "text-success" : "text-muted-foreground"}>{item.ready ? <CheckCircle2 className="size-4" /> : <Circle className="size-4" />}</span><span className={item.ready ? "text-foreground" : "text-muted-foreground"}>{item.label}</span></div>)}
            </div>
            <p className="mt-4 border-t border-border pt-3 text-[11px] leading-5 text-muted-foreground">Les taux réduits de TVA dépendent du chantier et de l’éligibilité du client. Ils doivent être validés avant l’envoi.</p>
          </section>
        </aside>
      </div>
    </form>
  )
}
