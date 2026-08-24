"use client"

import * as React from "react"
import { Boxes, Plus } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Line } from "@/components/shared/line-items-editor"
import { calculateConfiguredProductPrice } from "@/lib/product-pricing"

type Catalog = Awaited<ReturnType<typeof import("@/actions/products").getQuoteProductCatalog>>

function formatEuro(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100)
}

export function ProductConfigurator({ catalog, isTvaApplicable, onAdd }: { catalog: Catalog; isTvaApplicable: boolean; onAdd: (line: Line) => void }) {
  const [productId, setProductId] = React.useState("")
  const [selected, setSelected] = React.useState<Record<string, string[]>>({})
  const [quantity, setQuantity] = React.useState("1")
  const [discount, setDiscount] = React.useState("0")
  const product = catalog.find((candidate) => candidate.id === productId)

  const selectedValues = product?.optionGroups.flatMap((group) => group.values.filter((value) => selected[group.id]?.includes(value.id))) ?? []
  const pricing = product ? calculateConfiguredProductPrice({ baseSalePriceCents: product.salePriceCents, baseCostCents: product.baseCostCents, optionSaleDeltasCents: selectedValues.map((value) => value.priceDeltaCents), optionCostDeltasCents: selectedValues.map((value) => value.costDeltaCents), discountRate: Number(discount || 0) }) : null

  function chooseProduct(next: string) {
    setProductId(next)
    setSelected({})
    setDiscount("0")
  }

  function selectSingle(groupId: string, valueId: string) {
    setSelected((current) => ({ ...current, [groupId]: valueId === "none" ? [] : [valueId] }))
  }

  function toggleMultiple(groupId: string, valueId: string, maxSelect: number) {
    setSelected((current) => {
      const values = current[groupId] ?? []
      if (values.includes(valueId)) return { ...current, [groupId]: values.filter((id) => id !== valueId) }
      if (values.length >= maxSelect) {
        toast.error(`Maximum ${maxSelect} choix pour cette option.`)
        return current
      }
      return { ...current, [groupId]: [...values, valueId] }
    })
  }

  function addLine() {
    if (!product || !pricing) return
    for (const group of product.optionGroups) {
      const count = selected[group.id]?.length ?? 0
      if (count < group.minSelect || count > group.maxSelect) {
        toast.error(`${group.name} : choisissez entre ${group.minSelect} et ${group.maxSelect} valeur${group.maxSelect > 1 ? "s" : ""}.`)
        return
      }
    }
    const numericQuantity = Number(quantity)
    if (!Number.isFinite(numericQuantity) || numericQuantity <= 0) return toast.error("Quantité invalide.")
    const summaries = product.optionGroups.flatMap((group) => {
      const labels = group.values.filter((value) => selected[group.id]?.includes(value.id)).map((value) => value.label)
      return labels.length ? [`${group.name} : ${labels.join(", ")}`] : []
    })
    onAdd({
      productId: product.id,
      configuration: { optionValueIds: selectedValues.map((value) => value.id) },
      label: [product.label, product.variantLabel].filter(Boolean).join(" · "),
      description: summaries.join(" · "),
      quantity: numericQuantity,
      unitPriceCents: pricing.unitPriceCents,
      listUnitPriceCents: pricing.listUnitPriceCents,
      unitCostCents: pricing.unitCostCents,
      discountRate: pricing.discountRate,
      tvaRate: isTvaApplicable ? product.tvaRate : 0,
    })
    toast.success("Configuration ajoutée au devis.")
  }

  if (!catalog.length) return null

  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <div className="border-b px-5 py-4"><h2 className="flex items-center gap-2 text-sm font-semibold"><Boxes className="size-4 text-primary" />Configurateur produit</h2><p className="mt-1 text-xs text-muted-foreground">Le tarif, le coût, les options obligatoires et la remise seront revérifiés côté serveur.</p></div>
      <div className="space-y-5 p-5">
        <div className="grid gap-4 md:grid-cols-[minmax(260px,1fr)_120px_120px]">
          <div className="space-y-1.5"><Label>Référence</Label><Select value={productId} onValueChange={(value) => chooseProduct(value ?? "")}><SelectTrigger aria-label="Produit à configurer"><SelectValue placeholder="Choisir un produit ou une variante…" /></SelectTrigger><SelectContent>{catalog.map((candidate) => <SelectItem key={candidate.id} value={candidate.id}>{candidate.sku} · {candidate.label}{candidate.variantLabel ? ` · ${candidate.variantLabel}` : ""}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label htmlFor="configured-quantity">Quantité</Label><Input id="configured-quantity" type="number" min="0.01" step="0.01" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="configured-discount">Remise (%)</Label><Input id="configured-discount" type="number" min="0" max="100" step="0.1" value={discount} onChange={(event) => setDiscount(event.target.value)} /></div>
        </div>

        {product?.optionGroups.length ? <div className="grid gap-4 lg:grid-cols-2">{product.optionGroups.map((group) => <fieldset key={group.id} className="rounded-[10px] border p-4"><legend className="px-1 text-sm font-semibold">{group.name}{group.required ? " *" : ""}</legend>{group.description ? <p className="mb-3 text-xs text-muted-foreground">{group.description}</p> : null}{group.maxSelect === 1 ? <Select value={selected[group.id]?.[0] ?? "none"} onValueChange={(value) => selectSingle(group.id, value ?? "none")}><SelectTrigger aria-label={group.name}><SelectValue /></SelectTrigger><SelectContent>{group.minSelect === 0 ? <SelectItem value="none">Aucun</SelectItem> : null}{group.values.map((value) => <SelectItem key={value.id} value={value.id}>{value.label}{value.priceDeltaCents ? ` · ${value.priceDeltaCents > 0 ? "+" : ""}${formatEuro(value.priceDeltaCents)}` : ""}</SelectItem>)}</SelectContent></Select> : <div className="space-y-2">{group.values.map((value) => <label key={value.id} className="flex items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"><input type="checkbox" className="mt-0.5 size-4" checked={selected[group.id]?.includes(value.id) ?? false} onChange={() => toggleMultiple(group.id, value.id, group.maxSelect)} /><span className="min-w-0 flex-1">{value.label}{value.description ? <span className="block text-xs text-muted-foreground">{value.description}</span> : null}</span>{value.priceDeltaCents ? <span className="text-xs tabular-nums text-muted-foreground">{value.priceDeltaCents > 0 ? "+" : ""}{formatEuro(value.priceDeltaCents)}</span> : null}</label>)}</div>}</fieldset>)}</div> : null}

        {product && pricing ? <div className="flex flex-col gap-4 border-t pt-4 sm:flex-row sm:items-center"><div className="flex flex-wrap gap-x-6 gap-y-1 text-sm"><span><span className="text-muted-foreground">Tarif HT</span> <strong className="tabular-nums">{formatEuro(pricing.listUnitPriceCents)}</strong></span><span><span className="text-muted-foreground">Net HT</span> <strong className="tabular-nums text-primary">{formatEuro(pricing.unitPriceCents)}</strong></span><span><span className="text-muted-foreground">Marge unitaire</span> <strong className={`tabular-nums ${pricing.marginCents < 0 ? "text-danger" : "text-success"}`}>{formatEuro(pricing.marginCents)}</strong></span></div><Button type="button" onClick={addLine} className="sm:ml-auto"><Plus />Ajouter au devis</Button></div> : null}
      </div>
    </section>
  )
}
