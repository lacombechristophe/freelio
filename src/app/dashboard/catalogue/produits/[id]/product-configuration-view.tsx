"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Boxes, CircleDollarSign, Layers3, Pencil, Plus, Settings2, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { addProductComponent, createProductOptionGroup, createProductOptionValue, removeProductConfigurationItem } from "@/actions/products"
import { PageHeader } from "@/components/shared/page-header"
import { useConfirm } from "@/components/shared/confirm-provider"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ProductFormDialog, type CatalogProductFormValue } from "../../product-form-dialog"

type Detail = NonNullable<Awaited<ReturnType<typeof import("@/actions/products").getProductDetail>>>

function formatEuro(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100)
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(value))
}

function cents(form: FormData, name: string) {
  const number = Number(String(form.get(name) ?? "0").replace(",", "."))
  return Number.isFinite(number) ? Math.round(number * 100) : 0
}

export function ProductConfigurationView({ detail }: { detail: Detail }) {
  const { product } = detail
  const router = useRouter()
  const confirm = useConfirm()
  const [pending, startTransition] = React.useTransition()
  const [editOpen, setEditOpen] = React.useState(false)
  const [variantOpen, setVariantOpen] = React.useState(false)

  function submit(operation: () => Promise<unknown>, success: string, form?: HTMLFormElement) {
    startTransition(async () => {
      try {
        await operation()
        form?.reset()
        toast.success(success)
        router.refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Enregistrement impossible.")
      }
    })
  }

  async function remove(kind: "OPTION_GROUP" | "OPTION_VALUE" | "COMPONENT", id: string, label: string) {
    if (!await confirm({ title: `Retirer « ${label} » ?`, confirmLabel: "Retirer", destructive: true })) return
    submit(() => removeProductConfigurationItem({ kind, id }), "Configuration mise à jour.")
  }

  const margin = product.salePriceCents - product.purchasePriceCents
  const references = detail.references.map((reference) => ({ id: reference.id, sku: reference.sku, label: reference.label, parentProductId: reference.parentProductId }))

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={product.parentProduct ? `Variante de ${product.parentProduct.label}` : "Configuration produit"}
        title={product.label}
        description={[product.sku, product.family, product.manufacturer].filter(Boolean).join(" · ")}
        actions={<div className="flex flex-wrap gap-2"><Link href="/dashboard/catalogue" className={buttonVariants({ variant: "outline" })}><ArrowLeft />Catalogue</Link>{detail.canManage ? <><Button variant="outline" onClick={() => setEditOpen(true)}><Pencil />Modifier</Button>{!product.parentProductId ? <Button onClick={() => setVariantOpen(true)}><Plus />Ajouter une variante</Button> : null}</> : null}</div>}
      />

      <ProductFormDialog open={editOpen} onOpenChange={setEditOpen} product={product as CatalogProductFormValue} products={references} suppliers={detail.suppliers} />
      <ProductFormDialog open={variantOpen} onOpenChange={setVariantOpen} products={[{ id: product.id, sku: product.sku, label: product.label, parentProductId: product.parentProductId }, ...references]} suppliers={detail.suppliers} defaultParentProductId={product.id} defaultKind="VARIANT" />

      <section className="record-metrics grid grid-cols-2 overflow-hidden rounded-xl border bg-card sm:grid-cols-2 lg:grid-cols-4">
        <div className="p-4"><p className="text-xs text-muted-foreground">Prix de vente HT</p><p className="mt-1 text-lg font-semibold tabular-nums">{formatEuro(product.salePriceCents)}</p></div>
        <div className="border-t p-4 sm:border-l sm:border-t-0"><p className="text-xs text-muted-foreground">Coût de référence</p><p className="mt-1 text-lg font-semibold tabular-nums">{formatEuro(product.purchasePriceCents)}</p></div>
        <div className="border-t p-4 lg:border-l lg:border-t-0"><p className="text-xs text-muted-foreground">Marge unitaire prévue</p><p className={`mt-1 text-lg font-semibold tabular-nums ${margin < 0 ? "text-danger" : "text-success"}`}>{formatEuro(margin)}</p></div>
        <div className="border-t p-4 sm:border-l lg:border-t-0"><p className="text-xs text-muted-foreground">Mode logistique</p><p className="mt-1 text-sm font-semibold">{product.stockTracked ? "Suivi en stock" : "Fabriqué / commandé sur mesure"}</p></div>
      </section>

      {product.description ? <section className="rounded-xl border bg-card p-5"><h2 className="text-sm font-semibold">Description</h2><p className="mt-2 max-w-4xl whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{product.description}</p></section> : null}

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="overflow-hidden rounded-xl border bg-card">
          <div className="flex items-center justify-between gap-3 border-b px-5 py-4"><div><h2 className="flex items-center gap-2 text-sm font-semibold"><Layers3 className="size-4 text-primary" />Variantes</h2><p className="mt-1 text-xs text-muted-foreground">Références vendables rattachées à cette gamme.</p></div><Badge variant="secondary">{product.variants.length}</Badge></div>
          {product.variants.length ? <div className="divide-y">{product.variants.map((variant) => <Link key={variant.id} href={`/dashboard/catalogue/produits/${variant.id}`} className="flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-muted/40"><div><p className="text-sm font-medium">{variant.variantLabel || variant.label}</p><p className="mt-1 font-mono text-xs text-muted-foreground">{variant.sku}{variant.supplier ? ` · ${variant.supplier.name}` : ""}</p></div><p className="text-sm font-semibold tabular-nums">{formatEuro(variant.salePriceCents)}</p></Link>)}</div> : <p className="px-5 py-8 text-sm text-muted-foreground">Aucune variante. Le produit racine peut aussi être vendu directement.</p>}
        </section>

        <section className="overflow-hidden rounded-xl border bg-card">
          <div className="flex items-center justify-between gap-3 border-b px-5 py-4"><div><h2 className="flex items-center gap-2 text-sm font-semibold"><Boxes className="size-4 text-primary" />Nomenclature</h2><p className="mt-1 text-xs text-muted-foreground">Composants nécessaires et coefficient de perte.</p></div><Badge variant="secondary">{product.assemblyComponents.length}</Badge></div>
          {product.assemblyComponents.length ? <div className="divide-y">{product.assemblyComponents.map((component) => <div key={component.id} className="flex items-center gap-3 px-5 py-3"><div className="min-w-0 flex-1"><p className="text-sm font-medium">{component.componentProduct.label}</p><p className="mt-1 text-xs text-muted-foreground">{component.quantity} {component.componentProduct.unit}{component.wastePercent ? ` + ${component.wastePercent}% de perte` : ""}</p></div><p className="text-xs tabular-nums text-muted-foreground">{formatEuro(Math.round(component.quantity * component.componentProduct.purchasePriceCents * (1 + component.wastePercent / 100)))}</p>{detail.canManage ? <Button variant="ghost" size="icon-sm" title="Retirer le composant" onClick={() => void remove("COMPONENT", component.id, component.componentProduct.label)}><Trash2 className="text-danger" /></Button> : null}</div>)}</div> : <p className="px-5 py-8 text-sm text-muted-foreground">Aucun composant obligatoire.</p>}
          {detail.canManage ? <details className="border-t px-5 py-4"><summary className="cursor-pointer text-sm font-medium text-primary">Ajouter ou mettre à jour un composant</summary><form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); submit(() => addProductComponent({ productId: product.id, componentProductId: String(data.get("componentProductId")), quantity: Number(data.get("quantity")), wastePercent: Number(data.get("wastePercent") || 0), required: true, notes: String(data.get("notes") || "") }), "Nomenclature mise à jour.", form) }}><label className="space-y-1.5 text-xs font-medium">Composant<select name="componentProductId" required className="mt-1 h-10 w-full rounded-[10px] border bg-background px-3 text-sm"><option value="">Sélectionner…</option>{references.map((reference) => <option key={reference.id} value={reference.id}>{reference.sku} · {reference.label}</option>)}</select></label><label className="space-y-1.5 text-xs font-medium">Quantité<Input name="quantity" type="number" min="0.001" step="0.001" defaultValue="1" required /></label><label className="space-y-1.5 text-xs font-medium">Perte (%)<Input name="wastePercent" type="number" min="0" max="100" step="0.1" defaultValue="0" /></label><label className="space-y-1.5 text-xs font-medium">Notes<Input name="notes" /></label><Button type="submit" size="sm" disabled={pending} className="sm:col-span-2 sm:w-fit"><Plus />Ajouter le composant</Button></form></details> : null}
        </section>
      </div>

      <section className="overflow-hidden rounded-xl border bg-card">
        <div className="flex items-center justify-between gap-3 border-b px-5 py-4"><div><h2 className="flex items-center gap-2 text-sm font-semibold"><Settings2 className="size-4 text-primary" />Options configurables</h2><p className="mt-1 text-xs text-muted-foreground">Coloris, dimensions, motorisations, finitions ou accessoires avec impact prix/coût.</p></div><Badge variant="secondary">{product.optionGroups.length} groupe{product.optionGroups.length > 1 ? "s" : ""}</Badge></div>
        {product.optionGroups.length ? <div className="divide-y">{product.optionGroups.map((group) => <div key={group.id} className="px-5 py-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h3 className="text-sm font-semibold">{group.name}</h3>{group.required ? <Badge>Obligatoire</Badge> : <Badge variant="outline">Facultatif</Badge>}</div><p className="mt-1 text-xs text-muted-foreground">{group.minSelect} à {group.maxSelect} choix{group.description ? ` · ${group.description}` : ""}</p></div>{detail.canManage ? <Button variant="ghost" size="icon-sm" title="Supprimer le groupe" onClick={() => void remove("OPTION_GROUP", group.id, group.name)}><Trash2 className="text-danger" /></Button> : null}</div>{group.values.length ? <div className="mt-3 overflow-hidden rounded-lg border"><div className="divide-y">{group.values.map((value) => <div key={value.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm"><code className="w-20 shrink-0 text-xs text-muted-foreground">{value.code || "—"}</code><span className="min-w-40 flex-1 font-medium">{value.label}</span><span className="text-xs tabular-nums text-muted-foreground">Vente {value.priceDeltaCents >= 0 ? "+" : ""}{formatEuro(value.priceDeltaCents)}</span><span className="text-xs tabular-nums text-muted-foreground">Coût {value.costDeltaCents >= 0 ? "+" : ""}{formatEuro(value.costDeltaCents)}</span>{detail.canManage ? <Button variant="ghost" size="icon-xs" title="Supprimer la valeur" onClick={() => void remove("OPTION_VALUE", value.id, value.label)}><Trash2 className="text-danger" /></Button> : null}</div>)}</div></div> : <p className="mt-3 text-xs text-muted-foreground">Aucune valeur dans ce groupe.</p>}</div>)}</div> : <p className="px-5 py-8 text-sm text-muted-foreground">Aucun groupe d’options.</p>}
        {detail.canManage ? <div className="grid border-t lg:grid-cols-2"><details className="px-5 py-4"><summary className="cursor-pointer text-sm font-medium text-primary">Créer un groupe d’options</summary><form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); submit(() => createProductOptionGroup({ productId: product.id, name: String(data.get("name")), description: String(data.get("description") || ""), required: data.get("required") === "on", minSelect: Number(data.get("minSelect") || 0), maxSelect: Number(data.get("maxSelect") || 1) }), "Groupe d’options créé.", form) }}><label className="space-y-1.5 text-xs font-medium">Nom<Input name="name" required /></label><label className="space-y-1.5 text-xs font-medium">Description<Input name="description" /></label><label className="space-y-1.5 text-xs font-medium">Minimum<Input name="minSelect" type="number" min="0" defaultValue="0" /></label><label className="space-y-1.5 text-xs font-medium">Maximum<Input name="maxSelect" type="number" min="1" defaultValue="1" /></label><label className="flex items-center gap-2 text-xs font-medium"><input name="required" type="checkbox" />Choix obligatoire</label><Button type="submit" size="sm" disabled={pending} className="sm:w-fit"><Plus />Créer le groupe</Button></form></details><details className="border-t px-5 py-4 lg:border-l lg:border-t-0"><summary className="cursor-pointer text-sm font-medium text-primary">Ajouter une valeur d’option</summary><form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); submit(() => createProductOptionValue({ groupId: String(data.get("groupId")), code: String(data.get("code") || ""), label: String(data.get("label")), description: String(data.get("description") || ""), priceDeltaCents: cents(data, "priceDelta"), costDeltaCents: cents(data, "costDelta") }), "Valeur d’option ajoutée.", form) }}><label className="space-y-1.5 text-xs font-medium">Groupe<select name="groupId" required className="mt-1 h-10 w-full rounded-[10px] border bg-background px-3 text-sm"><option value="">Sélectionner…</option>{product.optionGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label><label className="space-y-1.5 text-xs font-medium">Code<Input name="code" /></label><label className="space-y-1.5 text-xs font-medium">Libellé<Input name="label" required /></label><label className="space-y-1.5 text-xs font-medium">Description<Input name="description" /></label><label className="space-y-1.5 text-xs font-medium">Supplément vente (€)<Input name="priceDelta" type="number" step="0.01" defaultValue="0" /></label><label className="space-y-1.5 text-xs font-medium">Supplément coût (€)<Input name="costDelta" type="number" step="0.01" defaultValue="0" /></label><Button type="submit" size="sm" disabled={pending} className="sm:col-span-2 sm:w-fit"><Plus />Ajouter la valeur</Button></form></details></div> : null}
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="overflow-hidden rounded-xl border bg-card"><div className="border-b px-5 py-4"><h2 className="flex items-center gap-2 text-sm font-semibold"><CircleDollarSign className="size-4 text-primary" />Historique des tarifs</h2></div>{product.priceHistory.length ? <div className="divide-y">{product.priceHistory.map((price) => <div key={price.id} className="flex items-center justify-between gap-4 px-5 py-3"><div><p className="text-sm font-medium">{price.kind === "SALE" ? "Prix de vente" : "Coût d’achat"}</p><p className="mt-1 text-xs text-muted-foreground">Depuis le {formatDate(price.validFrom)}{price.validUntil ? ` jusqu’au ${formatDate(price.validUntil)}` : " · actuel"}{price.supplier ? ` · ${price.supplier.name}` : ""}</p></div><p className="font-semibold tabular-nums">{formatEuro(price.amountCents)}</p></div>)}</div> : <p className="px-5 py-8 text-sm text-muted-foreground">Aucun historique.</p>}</section>
        <section className="overflow-hidden rounded-xl border bg-card"><div className="border-b px-5 py-4"><h2 className="flex items-center gap-2 text-sm font-semibold"><Boxes className="size-4 text-primary" />Disponibilité par dépôt</h2></div>{product.stockTracked && product.inventoryItems.length ? <div className="divide-y">{product.inventoryItems.map((item) => <div key={item.id} className="flex items-center justify-between gap-4 px-5 py-3"><p className="text-sm font-medium">{item.warehouse.name}</p><div className="text-right"><p className="text-sm font-semibold tabular-nums">{item.quantity - item.reservedQuantity} disponible</p><p className="text-xs text-muted-foreground">{item.quantity} physique · {item.reservedQuantity} réservé</p></div></div>)}</div> : <p className="px-5 py-8 text-sm text-muted-foreground">{product.stockTracked ? "Aucun stock enregistré." : "Produit géré sur commande ou fabrication sur mesure."}</p>}</section>
      </div>
    </div>
  )
}
