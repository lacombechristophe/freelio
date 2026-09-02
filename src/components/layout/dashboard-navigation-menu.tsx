"use client"

import * as React from "react"
import Link from "next/link"
import { ChevronDown, Star } from "lucide-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { dashboardHome, dashboardNavGroups, dashboardUtilityItems, navigationItemIsActive, type DashboardNavItem } from "./dashboard-navigation"

const FAVORITES_KEY = "crm-navigation-favorites-v1"

function NavLink({ item, active, compact = false, onFavorite, favorite }: { item: DashboardNavItem; active: boolean; compact?: boolean; onFavorite?: () => void; favorite?: boolean }) {
  return <div className="group/nav-item flex items-center gap-1">
    <Link href={item.href} aria-current={active ? "page" : undefined} className={cn("flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] leading-5 transition-[color,background-color]", compact ? "h-9" : "h-10", active ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]" : "text-sidebar-foreground/88 hover:bg-white/7 hover:text-white")}>
      <item.icon className={cn("size-4 shrink-0", active ? "text-white" : "text-sidebar-foreground/72")} />
      <span className="truncate">{item.name}</span>
    </Link>
    {onFavorite && <button type="button" onClick={onFavorite} aria-label={favorite ? `Retirer ${item.name} des favoris` : `Ajouter ${item.name} aux favoris`} className={cn("grid size-8.5 shrink-0 place-items-center rounded-lg text-sidebar-foreground/50 transition-[color,background-color,opacity] hover:bg-white/8 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring", !favorite && "opacity-0 group-hover/nav-item:opacity-100 group-focus-within/nav-item:opacity-100")}><Star className={cn("size-3.5", favorite && "fill-sidebar-primary text-sidebar-primary")} /></button>}
  </div>
}

export function DashboardNavigationMenu({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname()
  const currentQuery = useSearchParams().toString()
  const router = useRouter()
  const activeGroup = dashboardNavGroups.find((group) => group.items.some((item) => navigationItemIsActive(pathname, item, currentQuery)))?.name
  const [openGroups, setOpenGroups] = React.useState<Set<string>>(() => new Set(activeGroup ? [activeGroup] : ["CRM"]))
  const [favorites, setFavorites] = React.useState<string[]>([])

  React.useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(FAVORITES_KEY) || "[]")
      if (Array.isArray(stored)) setFavorites(stored.filter((value): value is string => typeof value === "string"))
    } catch { /* ignore invalid local preferences */ }
  }, [])

  React.useEffect(() => {
    if (!activeGroup) return
    setOpenGroups((current) => current.has(activeGroup) ? current : new Set([...current, activeGroup]))
  }, [activeGroup])

  function toggleFavorite(href: string) {
    setFavorites((current) => {
      const next = current.includes(href) ? current.filter((value) => value !== href) : [...current, href].slice(-10)
      window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(next))
      return next
    })
  }

  const allItems = dashboardNavGroups.flatMap((group) => group.items)
  const favoriteItems = favorites.map((href) => allItems.find((item) => item.href === href)).filter((item): item is DashboardNavItem => Boolean(item))

  return <nav aria-label="Navigation principale" className="space-y-1">
    {collapsed ? <Link href={dashboardHome.href} title={dashboardHome.name} aria-current={pathname === dashboardHome.href ? "page" : undefined} className={cn("mx-auto grid size-9.5 place-items-center rounded-[9px] text-sidebar-foreground/70 transition-[color,background-color] hover:bg-white/8 hover:text-white", pathname === dashboardHome.href && "bg-sidebar-accent text-white")}><dashboardHome.icon className="size-[17px]" /></Link> : <NavLink item={dashboardHome} active={pathname === dashboardHome.href} />}

    {!collapsed && favoriteItems.length > 0 && <section className="pt-3"><p className="mb-1 px-2.5 text-[10px] font-semibold uppercase text-sidebar-foreground/48">Favoris</p>{favoriteItems.map((item) => <NavLink key={item.href} item={item} active={navigationItemIsActive(pathname, item, currentQuery)} compact favorite onFavorite={() => toggleFavorite(item.href)} />)}</section>}

    <div className={cn("space-y-1", collapsed ? "pt-2" : "pt-3")}>
      {dashboardNavGroups.map((group) => {
        const active = group.items.some((item) => navigationItemIsActive(pathname, item, currentQuery))
        const open = openGroups.has(group.name)
        if (collapsed) return <DropdownMenu key={group.name}><DropdownMenuTrigger asChild><button type="button" aria-label={`Ouvrir ${group.name}`} title={group.name} className={cn("mx-auto grid size-9.5 place-items-center rounded-[9px] text-sidebar-foreground/70 transition-[color,background-color] hover:bg-white/8 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring", active && "bg-sidebar-accent text-white")}><group.icon className="size-[17px]" /></button></DropdownMenuTrigger><DropdownMenuContent side="right" sideOffset={8} className="w-72"><DropdownMenuLabel><span className="block text-sm font-semibold text-foreground">{group.name}</span><span className="mt-0.5 block font-normal leading-4">{group.description}</span></DropdownMenuLabel>{group.items.map((item) => <DropdownMenuItem key={`${item.href}-${item.name}`} onClick={() => router.push(item.href)} className="items-start py-2"><item.icon className="mt-0.5" /><span><span className="block font-medium">{item.name}</span>{item.description && <span className="mt-0.5 block text-xs text-muted-foreground">{item.description}</span>}</span></DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>
        return <section key={group.name}>
          <button type="button" onClick={() => setOpenGroups((current) => { const next = new Set(current); if (next.has(group.name)) next.delete(group.name); else next.add(group.name); return next })} aria-expanded={open} className={cn("flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-[11px] font-semibold uppercase transition-colors hover:bg-white/6", active ? "text-white" : "text-sidebar-foreground/70")}>
            <group.icon className={cn("size-3.5 shrink-0", active ? "text-sidebar-primary" : "text-sidebar-foreground/48")} /><span className="flex-1 text-left">{group.name}</span><ChevronDown className={cn("size-3.5 text-sidebar-foreground/45 transition-transform duration-200", open && "rotate-180")} />
          </button>
          {open && <div className="space-y-0.5 pb-1">{group.items.map((item) => <NavLink key={`${item.href}-${item.name}`} item={item} active={navigationItemIsActive(pathname, item, currentQuery)} compact favorite={favorites.includes(item.href)} onFavorite={() => toggleFavorite(item.href)} />)}</div>}
        </section>
      })}
    </div>

    {!collapsed && <section className="pt-3"><p className="mb-1 px-2.5 text-[10px] font-semibold uppercase text-sidebar-foreground/48">Administration</p>{dashboardUtilityItems.map((item) => <NavLink key={item.href} item={item} active={navigationItemIsActive(pathname, item, currentQuery)} compact />)}</section>}
  </nav>
}
