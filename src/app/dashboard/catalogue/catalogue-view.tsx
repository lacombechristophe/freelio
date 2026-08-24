"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Boxes, Layers3, MoreHorizontal, Package, Pencil, Plus, Search, Settings2, Wrench } from "lucide-react"
import { toast } from "sonner"

import { deleteService } from "@/actions/catalogue"
import { setCatalogProductActive } from "@/actions/products"
import { EmptyState } from "@/components/shared/empty-state"
import { PageHeader } from "@/components/shared/page-header"
import { useConfirm } from "@/components/shared/confirm-provider"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ProductFormDialog, type CatalogProductFormValue } from "./product-form-dialog"
import { ServiceFormDialog } from "./service-form-dialog"

type Service = {
  id: string
  code?: string | null
  label: string
  description?: string | null
  priceCents: number
  unit: string
  tvaRate: number
  categoryId?: string | null
  category?: { id: string; name: string } | null
}

type ProductData = Awaited<ReturnType<typeof import("@/actions/products").getProductCatalogue>>
type Product = ProductData["products"][number]

function formatEuro(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100)
}

const KIND_LABELS: Record<string, string> = {
  CONFIGURABLE: "Configurable",
  VARIANT: "Variante",
  MATERIAL: "Matière",
  ACCESSORY: "Accessoire",
  SERVICE_COMPONENT: "Pose",
}

export function CatalogueView({ services, categories, productData }: {
  services: Service[]
  categories: Array<{ id: string; name: string }>
  productData: ProductData
}) {
  const router = useRouter()
  const confirmDialog = useConfirm()
  const [serviceCreateOpen, setServiceCreateOpen] = React.useState(false)
  const [serviceEditTarget, setServiceEditTarget] = React.useState<Service | null>(null)
  const [productCreateOpen, setProductCreateOpen] = React.useState(false)
  const [productEditTarget, setProductEditTarget] = React.useState<Product | null>(null)
  const [search, setSearch] = React.useState("")

  const productChoices = productData.products.map((product) => ({ id: product.id, sku: product.sku, label: product.label, parentProductId: product.parentProductId }))
  const filteredProducts = productData.products.filter((product) => [product.sku, product.label, product.family, product.manufacturer, product.variantLabel].filter(Boolean).join(" ").toLowerCase().includes(search.trim().toLowerCase()))

  async function handleDeleteService(id: string, label: string) {
    if (!(await confirmDialog({ title: `Supprimer "${label}" ?`, confirmLabel: "Supprimer", destructive: true }))) return
    try {
      await deleteService(id)
      toast.success("Service supprimé.")
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Suppression impossible.")
    }
  }

  async function toggleProduct(product: Product) {
    try {
      await setCatalogProductActive(product.id, !product.active)
      toast.success(product.active ? "Produit archivé." : "Produit réactivé.")
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Modification impossible.")
    }
  }

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Offre"
        title="Catalogue"
        description="Structurez prestations, produits sur mesure, variantes, options, composants et tarifs sans perdre l’historique fournisseur."
        actions={<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setServiceCreateOpen(true)}><Wrench />Nouveau service</Button>{productData.canManage ? <Button onClick={() => setProductCreateOpen(true)}><Plus />Nouveau produit</Button> : null}</div>}
      />

      <ServiceFormDialog open={serviceCreateOpen} onOpenChange={setServiceCreateOpen} categories={categories} />
      {serviceEditTarget ? <ServiceFormDialog open onOpenChange={(open) => { if (!open) setServiceEditTarget(null) }} categories={categories} service={serviceEditTarget} /> : null}
      <ProductFormDialog open={productCreateOpen} onOpenChange={setProductCreateOpen} products={productChoices} suppliers={productData.suppliers} />
      {productEditTarget ? <ProductFormDialog open onOpenChange={(open) => { if (!open) setProductEditTarget(null) }} product={productEditTarget as CatalogProductFormValue} products={productChoices} suppliers={productData.suppliers} /> : null}

      <Tabs defaultValue="products" className="space-y-4">
        <TabsList><TabsTrigger value="products"><Boxes />Produits & configurations</TabsTrigger><TabsTrigger value="services"><Wrench />Prestations</TabsTrigger></TabsList>

        <TabsContent value="products" className="space-y-4">
          <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Rechercher un produit" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Référence, gamme, fabricant, variante…" className="pl-9" /></div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground"><span><strong className="text-foreground">{productData.products.filter((product) => product.active).length}</strong> références actives</span><span><strong className="text-foreground">{productData.products.filter((product) => product.parentProductId).length}</strong> variantes</span><span><strong className="text-foreground">{productData.products.reduce((sum, product) => sum + product.counts.optionGroups, 0)}</strong> groupes d’options</span></div>
          </div>

          {!filteredProducts.length ? (
            <div className="rounded-xl border bg-card"><EmptyState icon={Package} title={productData.products.length ? "Aucun produit ne correspond" : "Aucun produit configuré"} description={productData.products.length ? "Modifiez la recherche pour retrouver une référence." : "Créez une gamme, puis ajoutez ses variantes, options, composants et tarifs."} action={productData.canManage && !productData.products.length ? <Button onClick={() => setProductCreateOpen(true)}><Plus />Créer le premier produit</Button> : undefined} /></div>
          ) : <>
            <div className="space-y-3 md:hidden">
              {filteredProducts.map((product) => <article key={product.id} className={`rounded-xl border bg-card p-4 ${!product.active ? "opacity-55" : ""}`}>
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-mono text-xs font-semibold">{product.sku}</p><h3 className="mt-1 text-sm font-semibold">{product.label}</h3><p className="mt-1 text-xs text-muted-foreground">{[product.family, product.manufacturer, product.variantLabel].filter(Boolean).join(" · ") || "Sans gamme"}</p></div><Badge variant="outline">{KIND_LABELS[product.kind] || product.kind}</Badge></div>
                <div className="mt-3 flex flex-wrap gap-1.5"><Badge variant="secondary"><Layers3 />{product.counts.variants} variante{product.counts.variants > 1 ? "s" : ""}</Badge><Badge variant="secondary"><Settings2 />{product.counts.optionGroups} option{product.counts.optionGroups > 1 ? "s" : ""}</Badge><Badge variant="secondary"><Boxes />{product.counts.assemblyComponents} composant{product.counts.assemblyComponents > 1 ? "s" : ""}</Badge></div>
                <div className="mt-4 flex items-end justify-between gap-3 border-t pt-3"><div><p className="text-sm font-semibold tabular-nums">{formatEuro(product.salePriceCents)}</p><p className="mt-1 text-xs text-muted-foreground">{product.stockTracked ? `${product.availableQuantity} ${product.unit} disponible` : "Sur mesure"}</p></div><div className="flex gap-1"><Link href={`/dashboard/catalogue/produits/${product.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}><Settings2 />Configurer</Link>{productData.canManage ? <Button variant="ghost" size="icon-sm" aria-label={`Modifier ${product.label}`} onClick={() => setProductEditTarget(product)}><Pencil /></Button> : null}</div></div>
              </article>)}
            </div>
            <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
              <Table>
                <TableHeader className="bg-muted/50"><TableRow><TableHead>Référence</TableHead><TableHead>Produit</TableHead><TableHead>Structure</TableHead><TableHead>Tarifs HT</TableHead><TableHead>Stock</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                <TableBody>{filteredProducts.map((product) => <TableRow key={product.id} className={!product.active ? "opacity-55" : undefined}>
                  <TableCell><p className="font-mono text-xs font-semibold">{product.sku}</p><Badge variant="outline" className="mt-1">{KIND_LABELS[product.kind] || product.kind}</Badge></TableCell>
                  <TableCell><p className="font-medium">{product.label}</p><p className="mt-1 text-xs text-muted-foreground">{[product.family, product.manufacturer, product.variantLabel].filter(Boolean).join(" · ") || "Sans gamme"}</p>{product.parentProduct ? <p className="mt-1 text-xs text-primary">Variante de {product.parentProduct.label}</p> : null}</TableCell>
                  <TableCell><div className="flex flex-wrap gap-1.5"><Badge variant="secondary"><Layers3 />{product.counts.variants} variante{product.counts.variants > 1 ? "s" : ""}</Badge><Badge variant="secondary"><Settings2 />{product.counts.optionGroups} option{product.counts.optionGroups > 1 ? "s" : ""}</Badge><Badge variant="secondary"><Boxes />{product.counts.assemblyComponents} composant{product.counts.assemblyComponents > 1 ? "s" : ""}</Badge></div></TableCell>
                  <TableCell><p className="font-semibold tabular-nums">{formatEuro(product.salePriceCents)}</p><p className="mt-1 text-xs tabular-nums text-muted-foreground">Coût {formatEuro(product.purchasePriceCents)}</p></TableCell>
                  <TableCell><p className="text-sm font-medium tabular-nums">{product.stockTracked ? `${product.availableQuantity} ${product.unit}` : "Sur mesure"}</p><p className="mt-1 text-xs text-muted-foreground">{product.supplier?.name || "Sans fournisseur"}</p></TableCell>
                  <TableCell className="text-right"><div className="flex justify-end gap-1"><Link href={`/dashboard/catalogue/produits/${product.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}><Settings2 />Configurer</Link>{productData.canManage ? <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`Actions pour ${product.label}`}><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => setProductEditTarget(product)}>Modifier</DropdownMenuItem><DropdownMenuItem onClick={() => void toggleProduct(product)}>{product.active ? "Archiver" : "Réactiver"}</DropdownMenuItem></DropdownMenuContent></DropdownMenu> : null}</div></TableCell>
                </TableRow>)}</TableBody>
              </Table>
            </div>
          </>}
        </TabsContent>

        <TabsContent value="services">
          {!services.length ? (
            <div className="rounded-xl border bg-card"><EmptyState icon={Wrench} title="Aucune prestation" description="Ajoutez une prestation avec son tarif et son unité pour la réutiliser dans les devis." action={<Button onClick={() => setServiceCreateOpen(true)}><Plus />Ajouter une prestation</Button>} /></div>
          ) : (
            <div className="overflow-hidden rounded-xl border bg-card">
              <Table><TableHeader className="bg-muted/50"><TableRow><TableHead>Code</TableHead><TableHead>Libellé</TableHead><TableHead>Catégorie</TableHead><TableHead>Prix</TableHead><TableHead>Unité</TableHead><TableHead>TVA</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                <TableBody>{services.map((service) => <TableRow key={service.id}><TableCell className="font-mono text-xs">{service.code ?? "—"}</TableCell><TableCell><p className="font-medium">{service.label}</p>{service.description ? <p className="mt-1 max-w-md truncate text-xs text-muted-foreground">{service.description}</p> : null}</TableCell><TableCell>{service.category ? <Badge variant="secondary">{service.category.name}</Badge> : "—"}</TableCell><TableCell className="font-semibold">{formatEuro(service.priceCents)}</TableCell><TableCell className="text-xs uppercase">{service.unit}</TableCell><TableCell className="text-xs">{service.tvaRate}%</TableCell><TableCell className="text-right"><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Ouvrir les actions du service"><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => setServiceEditTarget(service)}>Modifier</DropdownMenuItem><DropdownMenuItem className="text-danger" onClick={() => void handleDeleteService(service.id, service.label)}>Supprimer</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TableCell></TableRow>)}</TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
