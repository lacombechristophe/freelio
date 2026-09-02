"use client"

import { useRouter } from "next/navigation"
import { ChevronDown, FileText, Plus, Receipt, Ticket, UserRoundPlus } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const CREATE_ACTIONS = [
  { label: "Client", description: "Créer une fiche client", href: "/dashboard/clients?create=1", icon: UserRoundPlus },
  { label: "Devis", description: "Préparer une proposition", href: "/dashboard/devis/new", icon: FileText },
  { label: "Facture", description: "Émettre une facture", href: "/dashboard/factures/new", icon: Receipt },
  { label: "Ticket SAV", description: "Ouvrir une demande", href: "/dashboard/operations?create=1", icon: Ticket },
] as const

export function QuickCreateMenu() {
  const router = useRouter()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="h-9 gap-1.5 px-3" aria-label="Ouvrir le menu de création">
          <Plus className="size-4" />
          <span className="hidden sm:inline">Créer</span>
          <span aria-hidden="true" className="mx-0.5 hidden h-4 w-px bg-white/25 sm:block" />
          <ChevronDown className="hidden size-3.5 sm:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-64">
        <DropdownMenuLabel>Création rapide</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {CREATE_ACTIONS.map((action) => (
          <DropdownMenuItem key={action.href} onClick={() => router.push(action.href)} className="items-start py-2.5">
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <action.icon className="size-4" />
            </span>
            <span>
              <span className="block font-medium">{action.label}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{action.description}</span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
