"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { signOut } from "next-auth/react"
import { toast } from "sonner"
import { useTheme } from "next-themes"
import { initials } from "@/lib/initials"
import { ChevronDown, CircleHelp, LogOut, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { isReadOnlyDemo } from "@/lib/demo-mode"
import { clearFieldOfflineData } from "@/lib/field/offline"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function UserMenu({ email, name, companyName }: { email?: string | null; name?: string | null; companyName?: string | null }) {
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const avatar = initials(name || email || "F")

  async function handleLogout() {
    try {
      await clearFieldOfflineData()
      await signOut({ redirect: false })
      toast.success("Déconnexion réussie.")
      router.push(isReadOnlyDemo ? "/" : "/auth/login")
    } catch {
      toast.error("Erreur lors de la déconnexion.")
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-10 gap-2 rounded-lg px-1.5 sm:pr-2" aria-label="Ouvrir le menu du compte">
          <span className="grid size-8 place-items-center rounded-full bg-foreground text-[11px] font-semibold text-background">{avatar}</span>
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
        <DropdownMenuLabel>Apparence</DropdownMenuLabel>
        <DropdownMenuRadioGroup aria-label="Apparence" value={theme ?? "light"} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light">Clair</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">Sombre</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">Système</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem demoMutation={false} variant="destructive" onClick={handleLogout}>
          <LogOut />Déconnexion
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
