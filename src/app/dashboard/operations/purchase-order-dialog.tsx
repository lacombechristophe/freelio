"use client"

import * as React from "react"
import { Plus, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { createPurchaseDraft } from "@/actions/purchase-drafts"
import { getPurchaseProductChoices, getPurchaseProjectChoices } from "@/actions/purchase-choices"
import { SupplierPicker } from "@/components/shared/supplier-picker"
import { DirectoryPagination } from "@/components/shared/directory-pagination"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { usePurchaseChoices } from "./use-purchase-choices"

type Line = { id: string; productId: string; label: string; quantity: string; unitPrice: string }
function newLine(): Line { return { id: crypto.randomUUID(), productId: "", label: "", quantity: "1", unitPrice: "0" } }

type Props = { open: boolean; onOpenChange: (open: boolean) => void; revision: unknown }
export function PurchaseOrderDialog({ open, onOpenChange, revision }: Props) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-3xl">
      <DialogHeader><DialogTitle>Nouvelle commande fournisseur</DialogTitle></DialogHeader>
      {open ? <PurchaseOrderForm revision={revision} onSuccess={() => onOpenChange(false)} /> : null}
    </DialogContent>
  </Dialog>
}

function PurchaseOrderForm({ revision, onSuccess }: { revision: unknown; onSuccess: () => void }) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)
  const [supplierId, setSupplierId] = React.useState("")
  const [projectId, setProjectId] = React.useState("")
  const [expectedAt, setExpectedAt] = React.useState("")
  const [notes, setNotes] = React.useState("")
  const [lines, setLines] = React.useState<Line[]>(() => [newLine()])
  const [verifiedProducts, setVerifiedProducts] = React.useState<Record<string, string>>({})
  const projects = usePurchaseChoices(projectId, true, revision, getPurchaseProjectChoices)
  const verifyProduct = React.useCallback((id: string, productId: string) => {
    setVerifiedProducts(current => current[id] === productId ? current : { ...current, [id]: productId })
  }, [])
  const blocked = Boolean(projectId && (!projects.ready || projects.busy)) || lines.some(line => line.productId && verifiedProducts[line.id] !== line.productId)

  function updateLine(id: string, patch: Partial<Line>) {
    setLines(current => current.map(line => line.id === id ? { ...line, ...patch } : line))
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending || blocked) return
    if (!supplierId) return toast.error("Sélectionnez un fournisseur.")
    setPending(true)
    try {
      const result = await createPurchaseDraft({ supplierId, projectId: projectId || undefined, expectedAt: expectedAt || undefined, notes, lines: lines.map(line => ({ productId: line.productId || undefined, label: line.label, quantity: Number(line.quantity), unitPriceCents: Math.round(Number(line.unitPrice || 0) * 100) })) })
      if (!result.success) throw new Error(result.error)
      toast.success(`Commande ${result.number} créée en brouillon.`)
      onSuccess()
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Création impossible.")
    } finally { setPending(false) }
  }

  return <form onSubmit={submit} className="space-y-5">
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="space-y-1.5"><Label>Fournisseur *</Label><SupplierPicker value={supplierId} onChange={setSupplierId} label="Fournisseur de la commande" required /></div>
      <div aria-label="Choix du chantier fournisseur" className="space-y-1.5 text-sm font-medium">
        <Label htmlFor="purchase-project">Chantier</Label>
        <Input aria-label="Rechercher un chantier pour l’achat" placeholder="Rechercher un chantier…" maxLength={200} value={projects.search} onChange={event => projects.searchFor(event.target.value)} />
        <select id="purchase-project" aria-label="Chantier de la commande" value={projectId} onChange={event => { projects.remember(event.target.value); setProjectId(event.target.value) }} className="mt-1 h-10 w-full rounded-[10px] border bg-background px-3 text-sm">
          <option value="">Aucun</option>{projects.options.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
        <DirectoryPagination total={projects.total} page={projects.page} pending={projects.busy} error={projects.error} onPage={projects.goToPage} onRetry={projects.retry} />
      </div>
      <div className="space-y-1.5"><Label htmlFor="purchase-expected">Livraison souhaitée</Label><Input id="purchase-expected" type="date" value={expectedAt} onChange={event => setExpectedAt(event.target.value)} /></div>
    </div>
    <div className="overflow-hidden rounded-xl border">
      <div className="grid grid-cols-[minmax(0,1fr)_88px_120px_36px] gap-2 border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground"><span>Produit / libellé</span><span>Qté</span><span>PU HT</span><span /></div>
      <div className="divide-y">{lines.map((line, index) => <PurchaseLine key={line.id} line={line} index={index} revision={revision} canRemove={lines.length > 1} onChange={patch => updateLine(line.id, patch)} onRemove={() => setLines(current => current.filter(item => item.id !== line.id))} onVerified={verifyProduct} />)}</div>
      <div className="border-t p-3"><Button demoMutation type="button" size="sm" variant="outline" onClick={() => setLines(current => [...current, newLine()])}><Plus />Ajouter une ligne</Button></div>
    </div>
    <div className="space-y-1.5"><Label htmlFor="purchase-notes">Instructions fournisseur</Label><textarea id="purchase-notes" className="min-h-20 w-full rounded-[10px] border bg-background px-3 py-2 text-sm" value={notes} onChange={event => setNotes(event.target.value)} /></div>
    <DialogFooter><DialogClose render={<Button type="button" variant="outline" />}>Annuler</DialogClose><Button demoMutation type="submit" disabled={pending || blocked}>{pending ? "Création…" : "Créer le brouillon"}</Button></DialogFooter>
  </form>
}

function PurchaseLine({ line, index, revision, canRemove, onChange, onRemove, onVerified }: {
  line: Line; index: number; revision: unknown; canRemove: boolean; onChange: (patch: Partial<Line>) => void; onRemove: () => void; onVerified: (id: string, productId: string) => void
}) {
  const products = usePurchaseChoices(line.productId, true, revision, getPurchaseProductChoices)
  React.useLayoutEffect(() => {
    onVerified(line.id, products.ready && !products.busy ? line.productId : "")
  }, [line.id, line.productId, products.ready, products.busy, onVerified])
  return <div data-purchase-line={line.id} className="grid gap-2 p-3 sm:grid-cols-[minmax(180px,0.8fr)_minmax(180px,1fr)_88px_120px_36px] sm:items-center">
    <div className="space-y-1.5">
      <Input aria-label={`Rechercher une référence pour la ligne ${index + 1}`} placeholder="Rechercher une référence…" maxLength={200} value={products.search} onChange={event => products.searchFor(event.target.value)} />
      <select aria-label={`Produit fournisseur ${index + 1}`} value={line.productId} onChange={event => {
        const productId = event.target.value, product = products.remember(productId)
        onChange({ productId, ...(product ? { label: product.label, unitPrice: (product.purchasePriceCents / 100).toString() } : {}) })
      }} className="h-10 min-w-0 rounded-[10px] border bg-background px-3 text-sm">
        <option value="">Ligne libre</option>{products.options.map(product => <option key={product.id} value={product.id}>{product.sku} · {product.label}</option>)}
      </select>
      <DirectoryPagination total={products.total} page={products.page} pending={products.busy} error={products.error} onPage={products.goToPage} onRetry={products.retry} />
    </div>
    <Input aria-label={`Libellé fournisseur ${index + 1}`} value={line.label} onChange={event => onChange({ label: event.target.value })} required />
    <Input aria-label={`Quantité fournisseur ${index + 1}`} type="number" min="1" step="1" value={line.quantity} onChange={event => onChange({ quantity: event.target.value })} required />
    <Input aria-label={`Prix fournisseur ${index + 1}`} type="number" min="0" step="0.01" value={line.unitPrice} onChange={event => onChange({ unitPrice: event.target.value })} required />
    <Button type="button" size="icon-sm" variant="ghost" aria-label={`Supprimer la ligne fournisseur ${index + 1}`} disabled={!canRemove} onClick={onRemove}><Trash2 className="text-danger" /></Button>
  </div>
}
