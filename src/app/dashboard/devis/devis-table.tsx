"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Plus, Search, MoreHorizontal, FileText, Clock,
  CheckCircle2, XCircle, Trash2, Send, FileDown, ShoppingCart,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { deleteQuote, updateQuoteStatus } from "@/actions/devis"
import { useConfirm } from "@/components/shared/confirm-provider"
import { EmptyState } from "@/components/shared/empty-state"
import { SavedViewBar } from "@/components/shared/saved-view-bar"

type Quote = {
  id: string
  number: string
  object: string
  status: string
  date: Date | string
  validUntil?: Date | string | null
  client: { id: string; name: string }
  versions: Array<{ totalHtCents: number; totalTvaCents: number; totalTtcCents: number }>
}

const statusConfig: Record<string, { label: string; class: string; icon: React.ElementType }> = {
  DRAFT: { label: "Brouillon", class: "bg-muted text-muted-foreground border-transparent", icon: Clock },
  SENT: { label: "Envoyé", class: "bg-primary/10 text-primary border-primary/20", icon: FileText },
  ACCEPTED: { label: "Accepté", class: "bg-success/10 text-success border-success/20", icon: CheckCircle2 },
  REJECTED: { label: "Refusé", class: "bg-danger/10 text-danger border-danger/20", icon: XCircle },
  EXPIRED: { label: "Expiré", class: "bg-muted text-muted-foreground border-transparent", icon: Clock },
}

function formatEuro(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100)
}

function formatDate(d: Date | string) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })
}

type SavedView = Awaited<ReturnType<typeof import("@/actions/views").getSavedViews>>[number]

export function DevisTable({ quotes, savedViews }: { quotes: Quote[]; savedViews: SavedView[] }) {
  const router = useRouter()
  const confirmDialog = useConfirm()
  const [search, setSearch] = useState("")

  const filtered = quotes.filter(
    (q) =>
      q.number.toLowerCase().includes(search.toLowerCase()) ||
      q.object.toLowerCase().includes(search.toLowerCase()) ||
      q.client.name.toLowerCase().includes(search.toLowerCase())
  )

  async function handleStatus(id: string, next: "SENT" | "ACCEPTED" | "REJECTED") {
    try {
      await updateQuoteStatus(id, next)
      toast.success("Statut mis à jour.")
      router.refresh()
    } catch (error: unknown) { toast.error(error instanceof Error ? error.message : "Action impossible.") }
  }

  async function handleDelete(id: string, number: string) {
    if (!(await confirmDialog({
      title: `Supprimer ${number} ?`,
      description: "Ce devis sera définitivement supprimé.",
      confirmLabel: "Supprimer",
      destructive: true,
    }))) return
    try {
      await deleteQuote(id)
      toast.success("Devis supprimé.")
      router.refresh()
    } catch (error: unknown) { toast.error(error instanceof Error ? error.message : "Action impossible.") }
  }

  return (
    <div className="space-y-4">
      <SavedViewBar resource="QUOTES" views={savedViews} config={{ search }} onApply={(config) => setSearch(typeof config.search === "string" ? config.search : "")} />
      <div className="workspace-panel flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Rechercher un devis"
            placeholder="Rechercher un devis…"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Link href="/dashboard/devis/new" className="sm:ml-auto">
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Nouveau devis
          </Button>
        </Link>
      </div>

      <div className="workspace-panel overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="w-[140px]">Référence</TableHead>
              <TableHead>Objet</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Montant HT</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="p-0 whitespace-normal">
                  <EmptyState
                    compact
                    icon={FileText}
                    title={quotes.length === 0 ? "Aucun devis pour le moment" : "Aucun devis trouvé"}
                    description={quotes.length === 0 ? "Composez une première proposition à partir d’un client et de votre catalogue." : "Modifiez votre recherche pour afficher d’autres devis."}
                    action={quotes.length === 0 ? <Button size="sm" onClick={() => router.push("/dashboard/devis/new")}><Plus />Créer un devis</Button> : <Button size="sm" variant="outline" onClick={() => setSearch("")}>Effacer la recherche</Button>}
                  />
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((quote) => {
                const status = statusConfig[quote.status] ?? statusConfig.DRAFT
                const latestVersion = quote.versions[0]
                return (
                  <TableRow key={quote.id} className="group hover:bg-muted/30 transition-colors">
                    <TableCell>
                      <Link href={`/dashboard/devis/${quote.id}`} className="font-mono text-xs font-bold hover:underline">
                        {quote.number}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/dashboard/devis/${quote.id}`} className="font-medium text-sm hover:underline">
                        {quote.object}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/dashboard/clients/${quote.client.id}`} className="text-sm hover:underline">
                        {quote.client.name}
                      </Link>
                    </TableCell>
                    <TableCell className="font-bold">
                      {latestVersion ? formatEuro(latestVersion.totalHtCents) : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(quote.date)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium", status.class)}>
                        <status.icon className="h-3 w-3" />
                        {status.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Ouvrir les actions du devis">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem
                            className="gap-2"
                            onClick={() => router.push(`/dashboard/devis/${quote.id}`)}
                          >
                            <FileText className="h-4 w-4 text-muted-foreground" /> Voir le devis
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="gap-2"
                            onClick={() => window.open(`/api/pdf/devis/${quote.id}`, "_blank")}
                          >
                            <FileDown className="h-4 w-4 text-muted-foreground" /> Télécharger PDF
                          </DropdownMenuItem>
                          {quote.status === "DRAFT" && (
                            <>
                              <DropdownMenuItem
                                className="gap-2"
                                onClick={() => router.push(`/dashboard/devis/${quote.id}/edit`)}
                              >
                                Éditer
                              </DropdownMenuItem>
                              <DropdownMenuItem className="gap-2" onClick={() => handleStatus(quote.id, "SENT")}>
                                <Send className="h-4 w-4 text-muted-foreground" /> Marquer comme envoyé
                              </DropdownMenuItem>
                            </>
                          )}
                          {quote.status === "SENT" && (
                            <>
                              <DropdownMenuItem className="gap-2 text-success" onClick={() => handleStatus(quote.id, "ACCEPTED")}>
                                <CheckCircle2 className="h-4 w-4" /> Accepter
                              </DropdownMenuItem>
                              <DropdownMenuItem className="gap-2 text-danger" onClick={() => handleStatus(quote.id, "REJECTED")}>
                                <XCircle className="h-4 w-4" /> Refuser
                              </DropdownMenuItem>
                            </>
                          )}
                          {quote.status === "ACCEPTED" && (
                            <DropdownMenuItem className="gap-2" onClick={() => router.push(`/dashboard/devis/${quote.id}#suite-du-dossier`)}>
                              <ShoppingCart className="h-4 w-4 text-muted-foreground" /> Préparer le dossier
                            </DropdownMenuItem>
                          )}
                          {quote.status === "DRAFT" && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="gap-2 text-danger" onClick={() => handleDelete(quote.id, quote.number)}>
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
