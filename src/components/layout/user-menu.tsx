"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { signOut } from "next-auth/react"
import { toast } from "sonner"
import { CircleHelp, LogOut, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function UserMenu({ email, name }: { email?: string | null; name?: string | null }) {
  const router = useRouter()
  const initials = (name || email || "F")
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")

  async function handleLogout() {
    try {
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
        <Button variant="ghost" size="icon" className="rounded-full" aria-label="Ouvrir le menu du compte">
          <span className="grid size-8 place-items-center rounded-full bg-foreground text-[11px] font-semibold text-background">{initials}</span>
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
