"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Plus, MoreHorizontal, Package } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { ServiceFormDialog } from "./service-form-dialog"
import { deleteService } from "@/actions/catalogue"
import { useConfirm } from "@/components/shared/confirm-provider"
import { EmptyState } from "@/components/shared/empty-state"
import { PageHeader } from "@/components/shared/page-header"

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

function formatEuro(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100)
}

export function CatalogueView({
  services,
  categories,
}: {
  services: Service[]
  categories: Array<{ id: string; name: string }>
}) {
  const router = useRouter()
  const confirmDialog = useConfirm()
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editTarget, setEditTarget] = React.useState<Service | null>(null)

  async function handleDelete(id: string, label: string) {
    if (!(await confirmDialog({
      title: `Supprimer "${label}" ?`,
      confirmLabel: "Supprimer",
      destructive: true,
    }))) return
    try {
      await deleteService(id)
      toast.success("Service supprimé.")
      router.refresh()
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur.")
    }
  }

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Offre"
        title="Catalogue"
        description="Enregistrez vos prestations, unités et tarifs pour composer des devis cohérents en quelques secondes."
        actions={<Button className="gap-2" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> Nouveau service
        </Button>}
      />

      <ServiceFormDialog open={createOpen} onOpenChange={setCreateOpen} categories={categories} />
      {editTarget && (
        <ServiceFormDialog
          open={!!editTarget}
          onOpenChange={(o) => !o && setEditTarget(null)}
          categories={categories}
          service={editTarget}
        />
      )}

      {services.length === 0 ? (
        <div className="rounded-xl border border-border bg-card">
          <EmptyState
            icon={Package}
            title="Votre catalogue est vide"
            description="Ajoutez une première prestation avec son tarif et son unité. Elle sera ensuite disponible dans tous vos devis."
            action={<Button onClick={() => setCreateOpen(true)}><Plus />Ajouter une prestation</Button>}
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Libellé</TableHead>
                <TableHead>Catégorie</TableHead>
                <TableHead>Prix</TableHead>
                <TableHead>Unité</TableHead>
                <TableHead>TVA</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {services.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs">{s.code ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{s.label}</span>
                      {s.description && (
                        <span className="text-xs text-muted-foreground truncate max-w-md">{s.description}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{s.category ? <Badge variant="secondary">{s.category.name}</Badge> : "—"}</TableCell>
                  <TableCell className="font-bold">{formatEuro(s.priceCents)}</TableCell>
                  <TableCell className="text-xs uppercase">{s.unit}</TableCell>
                  <TableCell className="text-xs">{s.tvaRate}%</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Ouvrir les actions du service">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditTarget(s)}>Éditer</DropdownMenuItem>
                        <DropdownMenuItem className="text-danger" onClick={() => handleDelete(s.id, s.label)}>
                          Supprimer
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
