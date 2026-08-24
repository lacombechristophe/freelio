"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Save, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LineItemsEditor, Line } from "@/components/shared/line-items-editor"
import { createQuote, updateQuote } from "@/actions/devis"

type Quote = {
  id: string
  clientId: string
  projectId?: string | null
  object: string
  validUntil?: Date | string | null
}

export function QuoteForm({
  quote,
  initialLines,
  clients,
  isTvaApplicable = true,
}: {
  quote?: Quote
  initialLines?: Line[]
  clients: Array<{ id: string; name: string }>
  isTvaApplicable?: boolean
}) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)
  const [clientId, setClientId] = React.useState(quote?.clientId ?? "")
  const [object, setObject] = React.useState(quote?.object ?? "")
  const [validUntil, setValidUntil] = React.useState(
    quote?.validUntil ? new Date(quote.validUntil).toISOString().slice(0, 10) : ""
  )
  const [lines, setLines] = React.useState<Line[]>(
    initialLines ?? [{ label: "", quantity: 1, unitPriceCents: 0, tvaRate: isTvaApplicable ? 20 : 0 }]
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const submittedLines = lines.map((line) => (isTvaApplicable ? line : { ...line, tvaRate: 0 }))
    if (!clientId) return toast.error("Sélectionnez un client.")
    if (submittedLines.length === 0 || !submittedLines.every((l) => l.label.trim())) {
      return toast.error("Chaque ligne doit avoir un libellé.")
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
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur.")
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/dashboard/devis">
          <Button type="button" variant="ghost" size="icon" aria-label="Retour aux devis">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <Button type="submit" disabled={pending} className="gap-2">
            <Save className="h-4 w-4" />
            {pending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">En-tête</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Client *</Label>
              <Select value={clientId} onValueChange={(v) => setClientId(v ?? "")}>
                <SelectTrigger aria-label="Client du devis">
                  <SelectValue placeholder="Sélectionner un client…" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="validUntil">Valide jusqu'au</Label>
              <Input
                id="validUntil"
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="object">Objet *</Label>
            <Input
              id="object"
              value={object}
              onChange={(e) => setObject(e.target.value)}
              placeholder="Ex : Fourniture et pose d’une couverture de piscine"
              required
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Lignes</CardTitle>
        </CardHeader>
        <CardContent>
          <LineItemsEditor lines={lines} onChange={setLines} isTvaApplicable={isTvaApplicable} />
        </CardContent>
      </Card>
    </form>
  )
}
