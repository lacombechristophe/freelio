"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Plus, Search, MoreHorizontal, FileSignature, Clock, CheckCircle2, Calendar, Eye, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { deleteContract, updateContractStatus } from "@/actions/contrats"
import { useConfirm } from "@/components/shared/confirm-provider"
import { EmptyState } from "@/components/shared/empty-state"

type Contract = {
  id: string
  number: string
  title: string
  status: string
  kind: string
  validUntil?: Date | string | null
  createdAt: Date | string
  client: { id: string; name: string }
  signatures: Array<{ id: string }>
}

const statusConfig: Record<string, { label: string; class: string; icon: React.ElementType }> = {
  DRAFT: { label: "Brouillon", class: "bg-muted text-muted-foreground border-transparent", icon: Clock },
  SENT: { label: "En attente", class: "bg-primary/10 text-primary border-primary/20", icon: FileSignature },
  SIGNED: { label: "Signé", class: "bg-success/10 text-success border-success/20", icon: CheckCircle2 },
  EXPIRED: { label: "Expiré", class: "bg-danger/10 text-danger border-danger/20", icon: Calendar },
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Erreur."
}

function formatDate(d: Date | string | null | undefined) {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })
}

export function ContratsTable({ contracts }: { contracts: Contract[] }) {
  const router = useRouter()
  const confirmDialog = useConfirm()
  const [search, setSearch] = React.useState("")

  const filtered = contracts.filter(
    (c) =>
      c.number.toLowerCase().includes(search.toLowerCase()) || c.title.toLowerCase().includes(search.toLowerCase()) || c.client.name.toLowerCase().includes(search.toLowerCase()),
  )

  async function handleStatus(id: string, next: "SENT") {
    try {
      const result = await updateContractStatus(id, next)
      if (result?.signingPath) {
        await navigator.clipboard.writeText(`${window.location.origin}${result.signingPath}`)
        toast.success("Lien de signature sécurisé copié.")
      } else {
        toast.success("Statut mis à jour.")
      }
      router.refresh()
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  async function handleDelete(id: string, number: string) {
    if (
      !(await confirmDialog({
        title: `Supprimer ${number} ?`,
        description: "Ce contrat sera définitivement supprimé.",
        confirmLabel: "Supprimer",
        destructive: true,
      }))
    )
      return
    try {
      await deleteContract(id)
      toast.success("Contrat supprimé.")
      router.refresh()
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Rechercher un contrat…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Link href="/dashboard/contrats/new" className="sm:ml-auto">
          <Button className="gap-2">
            <Plus className="h-4 w-4" /> Nouveau Contrat
          </Button>
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="w-[150px]">Référence</TableHead>
              <TableHead>Titre / Client</TableHead>
              <TableHead>Date Création</TableHead>
              <TableHead>Échéance</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="p-0 whitespace-normal">
                  <EmptyState
                    compact
                    icon={FileSignature}
                    title={contracts.length === 0 ? "Aucun contrat enregistré" : "Aucun contrat trouvé"}
                    description={
                      contracts.length === 0
                        ? "Formalisez une première mission et conservez signatures, conditions et échéances au même endroit."
                        : "Modifiez votre recherche pour afficher d’autres contrats."
                    }
                    action={
                      contracts.length === 0 ? (
                        <Button size="sm" onClick={() => router.push("/dashboard/contrats/new")}>
                          <Plus />
                          Créer un contrat
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => setSearch("")}>
                          Effacer la recherche
                        </Button>
                      )
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((contract) => {
                const status = statusConfig[contract.status] ?? statusConfig.DRAFT
                return (
                  <TableRow key={contract.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell>
                      <Link href={`/dashboard/contrats/${contract.id}`} className="font-mono text-xs font-bold text-muted-foreground hover:underline">
                        {contract.number}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link href={`/dashboard/contrats/${contract.id}`} className="font-medium text-sm hover:underline">
                            {contract.title}
                          </Link>
                          {contract.kind !== "STANDARD" && (
                            <Badge variant="outline" className="text-[10px]">
                              {contract.kind === "AMENDMENT" ? "Avenant" : "Renouvellement"}
                            </Badge>
                          )}
                        </div>
                        <Link href={`/dashboard/clients/${contract.client.id}`} className="text-xs text-muted-foreground uppercase hover:underline">
                          {contract.client.name}
                        </Link>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(contract.createdAt)}</TableCell>
                    <TableCell className="text-xs font-medium">{formatDate(contract.validUntil)}</TableCell>
                    <TableCell>
                      <Badge className={cn("gap-1.5 px-2 py-0.5 rounded-full text-xs uppercase font-bold border", status.class)}>
                        <status.icon className="h-3 w-3" />
                        {status.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Ouvrir les actions du contrat">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuLabel>Gestion du Contrat</DropdownMenuLabel>
                          <DropdownMenuItem className="gap-2" onClick={() => router.push(`/dashboard/contrats/${contract.id}`)}>
                            <Eye className="h-4 w-4 text-muted-foreground" /> Voir
                          </DropdownMenuItem>
                          {contract.status !== "SIGNED" && contract.kind === "STANDARD" && (
                            <DropdownMenuItem className="gap-2" onClick={() => router.push(`/dashboard/contrats/${contract.id}/edit`)}>
                              Éditer
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          {(contract.status === "DRAFT" || contract.status === "SENT") && (
                            <DropdownMenuItem className="gap-2" onClick={() => handleStatus(contract.id, "SENT")}>
                              <FileSignature className="h-4 w-4 text-muted-foreground" /> {contract.status === "SENT" ? "Régénérer le lien" : "Envoyer pour signature"}
                            </DropdownMenuItem>
                          )}
                          {contract.status !== "SIGNED" && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="gap-2 text-danger" onClick={() => handleDelete(contract.id, contract.number)}>
                                <Trash2 className="h-4 w-4" /> Supprimer
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
