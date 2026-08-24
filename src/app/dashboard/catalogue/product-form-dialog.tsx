"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { createCatalogProduct, updateCatalogProduct } from "@/actions/products"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export type CatalogProductFormValue = {
  id: string
  sku: string
  label: string
  description: string | null
  kind: string
  manufacturer: string | null
  family: string | null
  unit: string
  supplierId: string | null
  parentProductId: string | null
  variantLabel: string | null
  purchasePriceCents: number
  salePriceCents: number
  tvaRate: number
  stockTracked: boolean
}

const EMPTY_FORM = {
  sku: "",
  label: "",
  description: "",
  kind: "CONFIGURABLE",
  manufacturer: "",
  family: "",
  unit: "unité",
  supplierId: "",
  parentProductId: "",
  variantLabel: "",
  purchasePrice: "0",
  salePrice: "0",
  tvaRate: "20",
  stockTracked: false,
}

export function ProductFormDialog({ product, products, suppliers, defaultParentProductId, defaultKind, open, onOpenChange }: {
  product?: CatalogProductFormValue
  products: Array<{ id: string; sku: string; label: string; parentProductId: string | null }>
  suppliers: Array<{ id: string; name: string }>
  defaultParentProductId?: string
  defaultKind?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)
  const [form, setForm] = React.useState(EMPTY_FORM)

  React.useEffect(() => {
    if (!open) return
    setForm(product ? {
      sku: product.sku,
      label: product.label,
      description: product.description ?? "",
      kind: product.kind,
      manufacturer: product.manufacturer ?? "",
      family: product.family ?? "",
      unit: product.unit,
      supplierId: product.supplierId ?? "",
      parentProductId: product.parentProductId ?? "",
      variantLabel: product.variantLabel ?? "",
      purchasePrice: (product.purchasePriceCents / 100).toString(),
      salePrice: (product.salePriceCents / 100).toString(),
      tvaRate: product.tvaRate.toString(),
      stockTracked: product.stockTracked,
    } : { ...EMPTY_FORM, parentProductId: defaultParentProductId ?? "", kind: defaultKind ?? "CONFIGURABLE" })
  }, [defaultKind, defaultParentProductId, open, product])

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    try {
      const payload = {
        sku: form.sku,
        label: form.label,
        description: form.description,
        kind: form.kind,
        manufacturer: form.manufacturer,
        family: form.family,
        unit: form.unit,
        supplierId: form.supplierId || null,
        parentProductId: form.parentProductId || null,
        variantLabel: form.variantLabel,
        purchasePriceCents: Math.round(Number(form.purchasePrice || 0) * 100),
        salePriceCents: Math.round(Number(form.salePrice || 0) * 100),
        tvaRate: Number(form.tvaRate || 0),
        stockTracked: form.stockTracked,
      }
      if (product) {
        await updateCatalogProduct(product.id, payload)
        toast.success("Produit mis à jour et tarif historisé.")
        onOpenChange(false)
        router.refresh()
      } else {
        const created = await createCatalogProduct(payload)
        toast.success("Produit créé. Ajoutez maintenant ses options et composants.")
        onOpenChange(false)
        router.push(`/dashboard/catalogue/produits/${created.id}`)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Enregistrement impossible.")
    } finally {
      setPending(false)
    }
  }

  const parentChoices = products.filter((candidate) => candidate.id !== product?.id && !candidate.parentProductId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader><DialogTitle>{product ? "Modifier le produit" : "Nouveau produit ou variante"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-[180px_minmax(0,1fr)]">
            <div className="space-y-1.5"><Label htmlFor="product-sku">Référence / SKU *</Label><Input id="product-sku" value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} required /></div>
            <div className="space-y-1.5"><Label htmlFor="product-label">Libellé *</Label><Input id="product-label" value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} required /></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="product-description">Description commerciale et technique</Label><textarea id="product-description" className="min-h-20 w-full rounded-[10px] border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/20" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5"><Label>Nature</Label><Select value={form.kind} onValueChange={(value) => setForm({ ...form, kind: value ?? "CONFIGURABLE" })}><SelectTrigger aria-label="Nature du produit"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="CONFIGURABLE">Produit configurable</SelectItem><SelectItem value="VARIANT">Variante</SelectItem><SelectItem value="MATERIAL">Matière / composant</SelectItem><SelectItem value="ACCESSORY">Accessoire / option</SelectItem><SelectItem value="SERVICE_COMPONENT">Composant de pose</SelectItem></SelectContent></Select></div>
            <div className="space-y-1.5"><Label htmlFor="product-family">Famille / gamme</Label><Input id="product-family" value={form.family} onChange={(event) => setForm({ ...form, family: event.target.value })} placeholder="Couverture, abri, volet…" /></div>
            <div className="space-y-1.5"><Label htmlFor="product-manufacturer">Fabricant</Label><Input id="product-manufacturer" value={form.manufacturer} onChange={(event) => setForm({ ...form, manufacturer: event.target.value })} /></div>
            <div className="space-y-1.5"><Label>Fournisseur</Label><Select value={form.supplierId || "none"} onValueChange={(value) => setForm({ ...form, supplierId: value === "none" ? "" : value ?? "" })}><SelectTrigger aria-label="Fournisseur du produit"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Non renseigné</SelectItem>{suppliers.map((supplier) => <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Produit parent</Label><Select value={form.parentProductId || "none"} onValueChange={(value) => setForm({ ...form, parentProductId: value === "none" ? "" : value ?? "" })}><SelectTrigger aria-label="Produit parent"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Produit racine</SelectItem>{parentChoices.map((candidate) => <SelectItem key={candidate.id} value={candidate.id}>{candidate.sku} · {candidate.label}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label htmlFor="variant-label">Libellé de variante</Label><Input id="variant-label" value={form.variantLabel} onChange={(event) => setForm({ ...form, variantLabel: event.target.value })} placeholder="V10 · anthracite · 5 × 10 m" /></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5"><Label htmlFor="purchase-price">Coût HT (€)</Label><Input id="purchase-price" type="number" min="0" step="0.01" value={form.purchasePrice} onChange={(event) => setForm({ ...form, purchasePrice: event.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="sale-price">Prix de vente HT (€)</Label><Input id="sale-price" type="number" min="0" step="0.01" value={form.salePrice} onChange={(event) => setForm({ ...form, salePrice: event.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="product-tva">TVA (%)</Label><Input id="product-tva" type="number" min="0" max="100" step="0.1" value={form.tvaRate} onChange={(event) => setForm({ ...form, tvaRate: event.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="product-unit">Unité</Label><Input id="product-unit" value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} /></div>
          </div>
          <label className="flex items-start gap-3 rounded-[10px] border p-3 text-sm"><input type="checkbox" className="mt-0.5 size-4" checked={form.stockTracked} onChange={(event) => setForm({ ...form, stockTracked: event.target.checked })} /><span><strong className="block">Suivi en stock</strong><span className="mt-1 block text-xs text-muted-foreground">À activer pour les références réellement détenues dans un dépôt. Les produits fabriqués sur mesure restent généralement hors stock.</span></span></label>
          <DialogFooter><DialogClose render={<Button type="button" variant="outline" />}>Annuler</DialogClose><Button type="submit" disabled={pending}>{pending ? "Enregistrement…" : product ? "Enregistrer" : "Créer et configurer"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
