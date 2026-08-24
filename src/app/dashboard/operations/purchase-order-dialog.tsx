"use client"

import * as React from "react"
import { Plus, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { createPurchaseOrder } from "@/actions/operations"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Line = { productId: string; label: string; quantity: string; unitPrice: string }
const EMPTY_LINE: Line = { productId: "", label: "", quantity: "1", unitPrice: "0" }

export function PurchaseOrderDialog({ open, onOpenChange, suppliers, projects, products }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  suppliers: Array<{ id: string; name: string }>
  projects: Array<{ id: string; name: string }>
  products: Array<{ id: string; sku: string; label: string; purchasePriceCents: number }>
}) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)
  const [supplierId, setSupplierId] = React.useState("")
  const [projectId, setProjectId] = React.useState("")
  const [expectedAt, setExpectedAt] = React.useState("")
  const [notes, setNotes] = React.useState("")
  const [lines, setLines] = React.useState<Line[]>([EMPTY_LINE])

  React.useEffect(() => {
    if (!open) return
    setSupplierId("")
    setProjectId("")
    setExpectedAt("")
    setNotes("")
    setLines([EMPTY_LINE])
  }, [open])

  function updateLine(index: number, patch: Partial<Line>) {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line))
  }

  function chooseProduct(index: number, productId: string) {
    const product = products.find((candidate) => candidate.id === productId)
    updateLine(index, { productId, label: product?.label ?? lines[index].label, unitPrice: product ? (product.purchasePriceCents / 100).toString() : lines[index].unitPrice })
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supplierId) return toast.error("Sélectionnez un fournisseur.")
    setPending(true)
    try {
      const result = await createPurchaseOrder({ supplierId, projectId: projectId || undefined, expectedAt: expectedAt || undefined, notes, lines: lines.map((line) => ({ productId: line.productId || undefined, label: line.label, quantity: Number(line.quantity), unitPriceCents: Math.round(Number(line.unitPrice || 0) * 100) })) })
      toast.success(`Commande ${result.number} créée en brouillon.`)
      onOpenChange(false)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Création impossible.")
    } finally {
      setPending(false)
    }
  }

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-3xl"><DialogHeader><DialogTitle>Nouvelle commande fournisseur</DialogTitle></DialogHeader><form onSubmit={submit} className="space-y-5"><div className="grid gap-4 sm:grid-cols-3"><label className="space-y-1.5 text-sm font-medium">Fournisseur *<select aria-label="Fournisseur de la commande" value={supplierId} onChange={(event) => setSupplierId(event.target.value)} required className="mt-1 h-10 w-full rounded-[10px] border bg-background px-3 text-sm"><option value="">Sélectionner…</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label><label className="space-y-1.5 text-sm font-medium">Chantier<select aria-label="Chantier de la commande" value={projectId} onChange={(event) => setProjectId(event.target.value)} className="mt-1 h-10 w-full rounded-[10px] border bg-background px-3 text-sm"><option value="">Aucun</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><div className="space-y-1.5"><Label htmlFor="purchase-expected">Livraison souhaitée</Label><Input id="purchase-expected" type="date" value={expectedAt} onChange={(event) => setExpectedAt(event.target.value)} /></div></div><div className="overflow-hidden rounded-xl border"><div className="grid grid-cols-[minmax(0,1fr)_88px_120px_36px] gap-2 border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground"><span>Produit / libellé</span><span>Qté</span><span>PU HT</span><span /></div><div className="divide-y">{lines.map((line, index) => <div key={index} className="grid gap-2 p-3 sm:grid-cols-[minmax(180px,0.8fr)_minmax(180px,1fr)_88px_120px_36px] sm:items-center"><select aria-label={`Produit fournisseur ${index + 1}`} value={line.productId} onChange={(event) => chooseProduct(index, event.target.value)} className="h-10 min-w-0 rounded-[10px] border bg-background px-3 text-sm"><option value="">Ligne libre</option>{products.map((product) => <option key={product.id} value={product.id}>{product.sku} · {product.label}</option>)}</select><Input aria-label={`Libellé fournisseur ${index + 1}`} value={line.label} onChange={(event) => updateLine(index, { label: event.target.value })} required /><Input aria-label={`Quantité fournisseur ${index + 1}`} type="number" min="1" step="1" value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} required /><Input aria-label={`Prix fournisseur ${index + 1}`} type="number" min="0" step="0.01" value={line.unitPrice} onChange={(event) => updateLine(index, { unitPrice: event.target.value })} required /><Button type="button" size="icon-sm" variant="ghost" aria-label={`Supprimer la ligne fournisseur ${index + 1}`} disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}><Trash2 className="text-danger" /></Button></div>)}</div><div className="border-t p-3"><Button type="button" size="sm" variant="outline" onClick={() => setLines((current) => [...current, { ...EMPTY_LINE }])}><Plus />Ajouter une ligne</Button></div></div><div className="space-y-1.5"><Label htmlFor="purchase-notes">Instructions fournisseur</Label><textarea id="purchase-notes" className="min-h-20 w-full rounded-[10px] border bg-background px-3 py-2 text-sm" value={notes} onChange={(event) => setNotes(event.target.value)} /></div><DialogFooter><DialogClose render={<Button type="button" variant="outline" />}>Annuler</DialogClose><Button type="submit" disabled={pending}>{pending ? "Création…" : "Créer le brouillon"}</Button></DialogFooter></form></DialogContent></Dialog>
}
