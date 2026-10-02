"use client"

import * as React from "react"
import Link from "next/link"
import { ChevronDown, Menu, X } from "lucide-react"
import { usePathname, useSearchParams } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { dashboardHome, dashboardNavGroups, dashboardUtilityItems, navigationItemIsActive } from "./dashboard-navigation"
import { AppBrand, type WorkspaceBrand } from "@/components/shared/app-brand"

export function MobileSidebar({ brand }: { brand: WorkspaceBrand }) {
  const pathname = usePathname()
  const currentQuery = useSearchParams().toString()
  const [open, setOpen] = React.useState(false)
  const activeGroup = dashboardNavGroups.find((group) => group.items.some((item) => navigationItemIsActive(pathname, item, currentQuery)))?.name
  const [openGroups, setOpenGroups] = React.useState<Set<string>>(() => new Set(activeGroup ? [activeGroup] : ["Clients et ventes"]))

  React.useEffect(() => {
    if (!activeGroup) return
    setOpenGroups((current) => current.has(activeGroup) ? current : new Set([...current, activeGroup]))
  }, [activeGroup])

  React.useEffect(() => {
    if (!open) return

    const desktop = window.matchMedia("(min-width: 1024px)")
    const closeOnDesktop = () => { if (desktop.matches) setOpen(false) }
    closeOnDesktop()
    desktop.addEventListener("change", closeOnDesktop)
    return () => desktop.removeEventListener("change", closeOnDesktop)
  }, [open])

  return (
    <div className="lg:hidden">
      <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Ouvrir la navigation"
      />}>
        <Menu aria-hidden="true" className="h-5 w-5" />
      </DialogTrigger>

      <DialogContent showCloseButton={false} className="top-0 left-0 h-dvh max-h-dvh w-[304px] max-w-[88vw] translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-none border-r border-sidebar-border bg-sidebar p-0 text-sidebar-foreground sm:max-w-[304px] sm:p-0">
          <DialogTitle className="sr-only">Menu principal</DialogTitle>
          <nav
            id="mobile-dashboard-navigation"
            aria-label="Navigation principale"
            className="relative h-full w-[304px] max-w-[88vw] overscroll-contain border-r border-sidebar-border bg-sidebar "
          >
            <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
              <AppBrand brand={brand} />
              <DialogClose render={<Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Fermer la navigation"
              />}>
                <X aria-hidden="true" className="h-5 w-5 text-sidebar-accent-foreground" />
              </DialogClose>
            </div>

            <div className="h-[calc(100dvh-4rem)] space-y-1 overflow-y-auto px-3 py-4">
              <Link href={dashboardHome.href} aria-current={pathname === dashboardHome.href ? "page" : undefined} onClick={() => setOpen(false)} className={cn("flex h-10 items-center gap-3 rounded-[9px] px-3 text-sm font-semibold", pathname === dashboardHome.href ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground")}><dashboardHome.icon className="size-5" />{dashboardHome.name}</Link>
              <div className="pt-2">{dashboardNavGroups.map((group) => {
                const active = group.items.some((item) => navigationItemIsActive(pathname, item, currentQuery))
                const groupOpen = openGroups.has(group.name)
                return <section key={group.name} className="mb-1"><button type="button" onClick={() => setOpenGroups((current) => { const next = new Set(current); if (next.has(group.name)) next.delete(group.name); else next.add(group.name); return next })} aria-expanded={groupOpen} className={cn("flex h-10 w-full items-center gap-3 rounded-[9px] px-3 text-[13px] font-medium", active ? "text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground")}><group.icon className={cn("size-4", active && "text-sidebar-primary")} /><span className="flex-1 text-left">{group.name}</span><ChevronDown className={cn("size-4 transition-transform", groupOpen && "rotate-180")} /></button>{groupOpen && <div className="py-1">{group.items.map((item) => { const itemActive = navigationItemIsActive(pathname, item, currentQuery); return <Link key={`${item.href}-${item.name}`} href={item.href} onClick={() => setOpen(false)} className={cn("flex min-h-11 items-center gap-2.5 rounded-lg px-3 py-2 text-sm", itemActive ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground")}><item.icon className="size-4 shrink-0" />{item.name}</Link> })}</div>}</section>
              })}</div>
              <div className="border-t border-sidebar-border pt-3">{dashboardUtilityItems.map((item) => <Link key={`${item.href}-${item.name}`} href={item.href} onClick={() => setOpen(false)} className={cn("flex h-10 items-center gap-2.5 rounded-lg px-3 text-sm", navigationItemIsActive(pathname, item, currentQuery) ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground")}><item.icon className="size-4" />{item.name}</Link>)}</div>
            </div>
          </nav>
      </DialogContent>
      </Dialog>
    </div>
  )
}
