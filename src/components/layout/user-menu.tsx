"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { signOut } from "next-auth/react"
import { toast } from "sonner"
import { ChevronDown, CircleHelp, LogOut, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { clearFieldOfflineData } from "@/lib/field/offline"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function UserMenu({ email, name, companyName }: { email?: string | null; name?: string | null; companyName?: string | null }) {
  const router = useRouter()
  const initials = (name || email || "F")
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")

  async function handleLogout() {
    try {
      await clearFieldOfflineData()
      await signOut({ redirect: false })
      toast.success("Déconnexion réussie.")
      router.push("/auth/login")
    } catch {
      toast.error("Erreur lors de la déconnexion.")
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-10 gap-2 rounded-lg px-1.5 sm:pr-2" aria-label="Ouvrir le menu du compte">
          <span className="grid size-8 place-items-center rounded-full bg-foreground text-[11px] font-semibold text-background">{initials}</span>
          <span className="hidden min-w-0 text-left xl:block">
            <span className="block max-w-28 truncate text-xs font-semibold leading-4">{name ?? "Mon compte"}</span>
            {companyName ? <span className="block max-w-28 truncate text-[10px] font-normal leading-3 text-muted-foreground">{companyName}</span> : null}
          </span>
          <ChevronDown className="hidden size-3.5 text-muted-foreground xl:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col">
          <span className="font-semibold">{name ?? "Mon Compte"}</span>
          {email && <span className="text-xs text-muted-foreground font-normal truncate">{email}</span>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/dashboard/settings")}><Settings />Paramètres</DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push("/dashboard/help")}><CircleHelp />Aide</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={handleLogout}>
          <LogOut />Déconnexion
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
