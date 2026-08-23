"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Plus, Search, MoreHorizontal, User, Building2, Mail, Phone } from "lucide-react"
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { ClientFormDialog } from "./client-form-dialog"
import { deleteClient } from "@/actions/clients"
import { useConfirm } from "@/components/shared/confirm-provider"
import { EmptyState } from "@/components/shared/empty-state"

type Client = {
  id: string
  name: string
  type: string
  siret?: string | null
  tvaNumber?: string | null
  address?: string | null
  totalRevenueCents: number
  totalUnpaidCents: number
  relationScore: number
  contacts: Array<{ firstName: string; lastName: string; email?: string | null }>
}

function formatEuro(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100)
}

export function ClientsTable({ clients }: { clients: Client[] }) {
  const router = useRouter()
  const confirmDialog = useConfirm()
  const [search, setSearch] = React.useState("")
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editTarget, setEditTarget] = React.useState<Client | null>(null)

  const filtered = clients.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  )

  async function handleDelete(id: string, name: string) {
    if (!(await confirmDialog({
      title: `Supprimer "${name}" ?`,
      description: "Cette action est irréversible.",
      confirmLabel: "Supprimer",
      destructive: true,
    }))) return
    try {
      await deleteClient(id)
      toast.success("Client supprimé.")
      router.refresh()
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de la suppression.")
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher un client…"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button className="gap-2 sm:ml-auto" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Ajouter un client
        </Button>
      </div>

      <ClientFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      {editTarget && (
        <ClientFormDialog
          client={editTarget}
          open={!!editTarget}
          onOpenChange={(o) => !o && setEditTarget(null)}
        />
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[300px]">Nom / Contact</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>CA Total</TableHead>
              <TableHead>Impayé</TableHead>
              <TableHead>Relation</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="p-0 whitespace-normal">
                  <EmptyState
                    compact
                    icon={User}
                    title={clients.length === 0 ? "Aucun client enregistré" : "Aucun client trouvé"}
                    description={clients.length === 0 ? "Ajoutez votre premier client pour relier contacts, missions et documents." : "Modifiez votre recherche pour retrouver un autre client."}
                    action={clients.length === 0 ? <Button size="sm" onClick={() => setCreateOpen(true)}><Plus />Ajouter un client</Button> : <Button size="sm" variant="outline" onClick={() => setSearch("")}>Effacer la recherche</Button>}
                  />
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((client) => {
                const primaryContact = client.contacts[0]
                return (
                  <TableRow key={client.id} className="group hover:bg-muted/50 transition-colors">
                    <TableCell>
                      <Link href={`/dashboard/clients/${client.id}`} className="flex items-center gap-3">
                        <Avatar className="h-9 w-9 border">
                          <AvatarFallback className="bg-primary/5 text-primary text-xs">
                            {client.name.substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                          <span className="font-medium hover:underline">{client.name}</span>
                          {primaryContact && (
                            <span className="text-xs text-muted-foreground">
                              {primaryContact.firstName} {primaryContact.lastName}
                            </span>
                          )}
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-normal text-xs uppercase tracking-wider">
                        {client.type === "ENTERPRISE" && <Building2 className="h-3 w-3 mr-1" />}
                        {client.type === "INDIVIDUAL" && <User className="h-3 w-3 mr-1" />}
                        {client.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium text-sm">
                      {formatEuro(client.totalRevenueCents)}
                    </TableCell>
                    <TableCell>
                      <span className={cn(
                        "text-sm font-medium",
                        client.totalUnpaidCents > 0 ? "text-danger" : "text-muted-foreground"
                      )}>
                        {formatEuro(client.totalUnpaidCents)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 max-w-[60px] h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-colors",
                              client.relationScore > 80 ? "bg-success" : client.relationScore > 60 ? "bg-warning" : "bg-danger"
                            )}
                            style={{ width: `${client.relationScore}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium">{client.relationScore}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Ouvrir les actions du client">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          {primaryContact?.email && (
                            <DropdownMenuItem
                              className="gap-2"
                              onClick={() => window.open(`mailto:${primaryContact.email}`)}
                            >
                              <Mail className="h-4 w-4 text-muted-foreground" /> Envoyer un email
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            className="gap-2"
                            onClick={() => router.push(`/dashboard/clients/${client.id}`)}
                          >
                            <Phone className="h-4 w-4 text-muted-foreground" /> Voir la fiche
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setEditTarget(client)}>Éditer</DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-danger"
                            onClick={() => handleDelete(client.id, client.name)}
                          >
                            Supprimer
                          </DropdownMenuItem>
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
